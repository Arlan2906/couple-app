"""Дом питомца и его воспоминания.

Комнаты открываются с уровнем питомца, предметы — за ваши совместные дела.
В рамках на стене гостиной висят ваши фото из моментов.
Питомец «вспоминает» моменты из таймлайна: в годовщины и иногда просто так.
"""
import random
from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, select

from .auth import paired_user
from .bot import notify
from .db import (AsyncSession, BucketItem, Deposit, Goal, Moment, Mood, Note, Pet, PetAction,
                 PetUnlock, User, Wish, get_session)
from .pet import get_pet, level_for, members, stage_for

router = APIRouter(prefix="/api/pet")

ROOMS = [
    {"id": "living", "name": "Гостиная", "level": 1},
    {"id": "kitchen", "name": "Кухня", "level": 3},
    {"id": "garden", "name": "Сад", "level": 5},
    {"id": "attic", "name": "Чердак со звёздами", "level": 8},
]

# id, комната, картинка, название, (показатель, порог), подсказка; x/y — место в сцене (%)
ITEMS = [
    ("sofa", "living", "🛋️", "Диванчик", ("level", 1), "", 18, 72),
    ("rug", "living", "🧶", "Клубок", ("moments", 3), "Добавьте 3 момента", 74, 82),
    ("lamp", "living", "💡", "Лампа", ("pet_actions", 10), "Покормите и погладьте 10 раз", 86, 40),
    ("plant", "living", "🪴", "Цветок", ("both_days", 3), "3 дня, когда настроение отметили оба", 8, 44),
    ("tv", "living", "📺", "Телевизор", ("moments", 10), "Добавьте 10 моментов", 52, 48),
    ("table", "kitchen", "🍽️", "Стол", ("level", 3), "", 20, 80),
    ("coffee", "kitchen", "☕", "Кофемашина", ("both_days", 7), "7 дней, когда отметились оба", 12, 46),
    ("pizza", "kitchen", "🍕", "Пицца", ("feeds", 15), "Покормите 15 раз", 20, 64),
    ("cupcake", "kitchen", "🧁", "Капкейк", ("deposits", 5), "5 пополнений копилки", 82, 82),
    ("teapot", "kitchen", "🫖", "Чайник", ("notes", 3), "3 записки в «Несказанном»", 84, 48),
    ("tree", "garden", "🌳", "Дерево", ("level", 5), "", 16, 60),
    ("tulip", "garden", "🌷", "Тюльпаны", ("bucket_done", 1), "Первая сбывшаяся мечта", 28, 84),
    ("kite", "garden", "🪁", "Воздушный змей", ("bucket_done", 3), "3 сбывшиеся мечты", 78, 22),
    ("fountain", "garden", "⛲", "Фонтан", ("deposits", 15), "15 пополнений копилки", 82, 70),
    ("tent", "garden", "🏕️", "Палатка", ("moments", 20), "20 моментов", 64, 44),
    ("telescope", "attic", "🔭", "Телескоп", ("level", 8), "", 80, 64),
    ("moon", "attic", "🌙", "Луна в окне", ("both_days", 30), "30 дней, когда отметились оба", 20, 22),
    ("guitar", "attic", "🎸", "Гитара", ("moments", 30), "30 моментов", 16, 72),
    ("trophy", "attic", "🏆", "Кубок", ("bucket_done", 5), "5 сбывшихся мечт", 52, 46),
    ("gift", "attic", "🎁", "Сундук подарков", ("wishes_received", 3), "Подарить друг другу 3 желания", 28, 84),
]
FRAMES = [(1, "Фото в рамке", "Первый момент с фото"), (3, "Вторая рамка", "3 момента с фото"),
          (6, "Третья рамка", "6 моментов с фото")]
ITEM_BY_ID = {i[0]: i for i in ITEMS}


async def stats(s: AsyncSession, pet: Pet) -> dict:
    cid = pet.couple_id
    one = lambda q: s.execute(q)  # noqa: E731
    moments = (await one(select(func.count()).select_from(Moment).where(Moment.couple_id == cid))).scalar() or 0
    photos = (await one(select(func.count()).select_from(Moment).where(
        Moment.couple_id == cid, Moment.photo_file_id.is_not(None)))).scalar() or 0
    both_sub = (select(Mood.day).where(Mood.couple_id == cid).group_by(Mood.day)
                .having(func.count(func.distinct(Mood.user_id)) >= 2).subquery())
    both_days = (await one(select(func.count()).select_from(both_sub))).scalar() or 0
    bucket_done = (await one(select(func.count()).select_from(BucketItem).where(
        BucketItem.couple_id == cid, BucketItem.done.is_(True)))).scalar() or 0
    deposits = (await one(select(func.count()).select_from(Deposit).join(Goal, Goal.id == Deposit.goal_id).where(
        Goal.couple_id == cid, Deposit.amount > 0))).scalar() or 0
    wishes_received = (await one(select(func.count()).select_from(Wish).where(
        Wish.couple_id == cid, Wish.received.is_(True)))).scalar() or 0
    pet_actions = (await one(select(func.count()).select_from(PetAction).where(PetAction.pet_id == pet.id))).scalar() or 0
    feeds = (await one(select(func.count()).select_from(PetAction).where(
        and_(PetAction.pet_id == pet.id, PetAction.action == "feed")))).scalar() or 0
    notes = (await one(select(func.count()).select_from(Note).where(Note.couple_id == cid))).scalar() or 0
    return {"level": level_for(pet.xp) if stage_for(pet.xp) != "egg" else 0, "moments": moments, "photos": photos,
            "both_days": both_days, "bucket_done": bucket_done, "deposits": deposits,
            "wishes_received": wishes_received, "pet_actions": pet_actions, "feeds": feeds, "notes": notes}


def unlocked_ids(st: dict) -> set[str]:
    ids = {f"room:{r['id']}" for r in ROOMS if st["level"] >= r["level"]}
    ids |= {i[0] for i in ITEMS if st[i[4][0]] >= i[4][1] and st["level"] >= room_level(i[1])}
    ids |= {f"frame{n}" for n, *_ in FRAMES if st["photos"] >= n}
    return ids


def room_level(room_id: str) -> int:
    return next(r["level"] for r in ROOMS if r["id"] == room_id)


def describe(item_id: str) -> str:
    if item_id.startswith("room:"):
        r = next(r for r in ROOMS if r["id"] == item_id[5:])
        return f"новая комната — {r['name'].lower()}"
    if item_id.startswith("frame"):
        return "новая рамка с вашим фото"
    i = ITEM_BY_ID[item_id]
    room = next(r["name"] for r in ROOMS if r["id"] == i[1])
    return f"{i[3].lower()} ({room.lower()})"


async def check_unlocks(s: AsyncSession, pet: Pet) -> None:
    """Сравнить, что открыто сейчас, с тем, что уже было, и сообщить о новом."""
    if stage_for(pet.xp) == "egg":
        return
    now_ids = unlocked_ids(await stats(s, pet))
    had = set((await s.execute(select(PetUnlock.item_id).where(PetUnlock.pet_id == pet.id))).scalars())
    new = now_ids - had
    if not new:
        return
    for i in new:
        s.add(PetUnlock(pet_id=pet.id, item_id=i))
    await s.commit()
    if not had:  # первый расчёт после вылупления: без спама, просто запоминаем
        return
    items = sorted(new, key=lambda x: (not x.startswith("room:"), x))
    text = f"В доме у {pet.name} " + ("новое: " + ", ".join(describe(i) for i in items))
    for m in await members(s, pet.couple_id):
        await notify(m.id, text, button="Посмотреть", tab="pet")


# ---------- воспоминания ----------

def months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def ago_text(d: date, today: date) -> str:
    m = months_between(d, today) - (1 if today.day < d.day else 0)
    if m >= 12:
        y = m // 12
        return f"{y} {'год' if y == 1 else 'года' if y < 5 else 'лет'} назад"
    if m >= 1:
        return f"{m} {'месяц' if m == 1 else 'месяца' if m < 5 else 'месяцев'} назад"
    days = (today - d).days
    return f"{days} {'день' if days % 10 == 1 and days != 11 else 'дня' if days % 10 in (2, 3, 4) and days not in (12, 13, 14) else 'дней'} назад"


def pick_memory(moments: list[Moment], today: date, couple_id: int) -> dict | None:
    """Годовщина момента (ровно N месяцев/лет) — всегда; иначе случайный старый момент через день."""
    for m in sorted(moments, key=lambda x: x.happened_on):
        d = m.happened_on
        if d < today and d.day == today.day and months_between(d, today) >= 1:
            n = months_between(d, today)
            when = (f"Ровно {n // 12} {'год' if n // 12 == 1 else 'года' if n // 12 < 5 else 'лет'} назад"
                    if n % 12 == 0 else f"Ровно {n} {'месяц' if n == 1 else 'месяца' if n < 5 else 'месяцев'} назад")
            return {"moment_id": m.id, "title": m.title, "photo": m.photo_file_id, "anniversary": True,
                    "text": f"{when} было «{m.title}». Помните?"}
    old = [m for m in moments if (today - m.happened_on).days >= 7]
    if not old or today.toordinal() % 2:
        return None
    rnd = random.Random(f"{couple_id}:{today.isoformat()}")
    m = rnd.choice(sorted(old, key=lambda x: x.id))
    return {"moment_id": m.id, "title": m.title, "photo": m.photo_file_id, "anniversary": False,
            "text": f"А помните «{m.title}»? Это было {ago_text(m.happened_on, today)}."}


async def memory_for(s: AsyncSession, couple_id: int, today: date) -> dict | None:
    moments = (await s.execute(select(Moment).where(Moment.couple_id == couple_id))).scalars().all()
    return pick_memory(list(moments), today, couple_id)


async def memory_line(s: AsyncSession, couple_id: int, today: date) -> str:
    """Строчка для утренней рассылки: питомец делится воспоминанием."""
    pet = await get_pet(s, couple_id)
    if not pet or stage_for(pet.xp) == "egg":
        return ""
    mem = await memory_for(s, couple_id, today)
    return f"\n\n{pet.name} вспоминает: {mem['text']}" if mem else ""


# ---------- API ----------

@router.get("/house")
async def house(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    from .api import today  # дата по Алматы
    pet = await get_pet(s, user.couple_id)
    if not pet:
        return {"house": None}
    await check_unlocks(s, pet)
    st = await stats(s, pet)
    ids = unlocked_ids(st)
    photos = (await s.execute(select(Moment.photo_file_id).where(
        Moment.couple_id == user.couple_id, Moment.photo_file_id.is_not(None))
        .order_by(Moment.happened_on.desc()).limit(3))).scalars().all()
    rooms = []
    for r in ROOMS:
        items = []
        for i in ITEMS:
            if i[1] != r["id"]:
                continue
            key, need = i[4]
            items.append({"id": i[0], "emoji": i[2], "name": i[3], "unlocked": i[0] in ids, "hint": i[5],
                          "progress": min(st[key], need), "need": need, "x": i[6], "y": i[7]})
        rooms.append({**r, "unlocked": f"room:{r['id']}" in ids, "items": items})
    frames = [{"name": name, "hint": hint, "unlocked": f"frame{n}" in ids,
               "photo": photos[idx] if idx < len(photos) and f"frame{n}" in ids else None}
              for idx, (n, name, hint) in enumerate(FRAMES)]
    return {"house": {"rooms": rooms, "frames": frames, "level": st["level"]},
            "memory": await memory_for(s, user.couple_id, today())}
