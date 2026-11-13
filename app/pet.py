"""Тамагочи пары.

Сытость и радость медленно убывают со временем. Питомец растёт (опыт → уровень) от всего,
что вы делаете в приложении: отмечаете настроение, добавляете моменты, копите, сбываете мечты.
Плюс прямые действия: покормить и погладить (с перезарядкой у каждого своей).
Питомец никогда не умирает — только грустит, если про него забыли.
"""
import math
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from . import config
from .auth import paired_user
from .bot import notify
from .db import AsyncSession, Mood, Pet, PetAction, User, get_session

router = APIRouter(prefix="/api/pet")

KINDS = {"cat": "🐱", "dog": "🐶", "fox": "🦊", "panda": "🐼", "bunny": "🐰",
         "hamster": "🐹", "penguin": "🐧", "dragon": "🐲"}

FOOD_DECAY_PER_H = 2.0      # от полной сытости до нуля ~2 суток
JOY_DECAY_PER_H = 1.5
HATCH_XP = 30               # яйцо вылупляется после нескольких действий
FEED_COOLDOWN = int(1.5 * 3600)   # перезарядка кормления: 1,5 часа (у каждого своя)
ACTIONS = {                 # перезарядка (сек), сытость, радость, опыт
    "feed": (FEED_COOLDOWN, 22, 3, 3),
    "pet": (1 * 3600, 0, 12, 3),
}
# награды за действия в других вкладках
REWARDS = {
    "mood": (8, 4, 10),
    "mood_both": (0, 10, 10),    # бонус, когда за день отметились оба
    "moment": (0, 15, 15),
    "wish": (0, 4, 5),
    "deposit": (0, 6, 5),
    "goal": (0, 6, 5),
    "bucket_add": (0, 5, 5),
    "bucket_done": (10, 30, 40),
    "note": (0, 8, 10),
    "mood_reply": (0, 6, 4),     # ответили на настроение партнёра
}
TZ = ZoneInfo(config.TIMEZONE)
SLEEP_FROM, SLEEP_TO = 23, 7      # ночью питомец спит (по Алматы)
SAD_MOODS = {"😔", "😢", "😤", "🤒", "🤯", "🫠"}
WALK_WAIT = 60 * 60               # сколько ждём, пока второй подтвердит прогулку
WALK_COOLDOWN = 6 * 3600          # прогулка — раз в 6 часов на пару
WALK_REWARD = (5, 25, 20)         # сытость, радость, опыт


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def level_for(xp: int) -> int:
    # уровень L начинается с 25·L·(L−1) опыта: 0, 50, 150, 300, 500, 750, 1050…
    return int((1 + math.sqrt(1 + 4 * xp / 25)) / 2)


def level_start(level: int) -> int:
    return 25 * level * (level - 1)


def stage_for(xp: int) -> str:
    if xp < HATCH_XP:
        return "egg"
    lvl = level_for(xp)
    return "baby" if lvl <= 2 else "kid" if lvl <= 5 else "adult" if lvl <= 9 else "legend"


def apply_decay(pet: Pet, now: datetime) -> None:
    hours = max(0.0, (now - pet.updated_at).total_seconds() / 3600)
    if stage_for(pet.xp) != "egg":  # яйцо не голодает
        pet.food = max(0.0, pet.food - FOOD_DECAY_PER_H * hours)
        pet.joy = max(0.0, pet.joy - JOY_DECAY_PER_H * hours)
    pet.updated_at = now


def is_night(now_local: datetime | None = None) -> bool:
    h = (now_local or datetime.now(TZ)).hour
    return h >= SLEEP_FROM or h < SLEEP_TO


def status_for(pet: Pet, viewer: User | None = None, sad: list[tuple[User, Mood]] | None = None,
               night: bool = False) -> tuple[str, str]:
    """sad — грустные настроения за сегодня, на которые второй ещё не ответил."""
    if stage_for(pet.xp) == "egg":
        return "egg", "Тёплое яйцо. Кажется, внутри кто-то шевелится…"
    if pet.food < 10 and pet.joy < 10:
        return "sad", "Совсем загрустил и проголодался"
    if pet.food < 25:
        return "hungry", "Урчит животик — покормите!"
    if night:
        return "sleep", "Спит. Тише, не разбудите"
    if sad:
        if len(sad) > 1:
            return "worried", "Переживает за вас обоих. Обнимитесь"
        who, _m = sad[0]
        if viewer and who.id == viewer.id:
            return "worried", "Видит, что тебе сегодня нелегко, и жмётся рядом"
        return "worried", f"Переживает: {who.name} сегодня не очень. Напиши, обними"
    if pet.joy < 25:
        return "bored", "Скучает по вам. Погладьте!"
    if pet.food > 70 and pet.joy > 70:
        return "happy", "Счастлив и сыт"
    return "ok", "Всё хорошо"


async def members(s: AsyncSession, couple_id: int) -> list[User]:
    return (await s.execute(select(User).where(User.couple_id == couple_id))).scalars().all()


async def get_pet(s: AsyncSession, couple_id: int) -> Pet | None:
    return (await s.execute(select(Pet).where(Pet.couple_id == couple_id))).scalar_one_or_none()


async def _gain(s: AsyncSession, pet: Pet, food: float, joy: float, xp: int) -> None:
    """Прибавить сытость/радость/опыт и разослать новости о вылуплении и уровнях."""
    apply_decay(pet, utcnow())
    was_egg, old_level = stage_for(pet.xp) == "egg", level_for(pet.xp)
    pet.food = min(100.0, pet.food + food)
    pet.joy = min(100.0, pet.joy + joy)
    pet.xp += xp
    await s.commit()
    news = None
    if was_egg and stage_for(pet.xp) != "egg":
        news = f"Ура! {pet.name} вылупился!\nТеперь его нужно кормить и гладить."
    elif not was_egg and level_for(pet.xp) > old_level:
        news = f"{pet.name} вырос до {level_for(pet.xp)} уровня!"
        if stage_for(pet.xp) != stage_for(pet.xp - xp):
            news += " Смотрите, как он изменился"
    if news:
        for m in await members(s, pet.couple_id):
            await notify(m.id, news, button="Посмотреть", tab="pet")
    from .house import check_unlocks  # локально, чтобы не было циклического импорта
    await check_unlocks(s, pet)


async def award(s: AsyncSession, couple_id: int | None, reason: str) -> None:
    """Вызывается из других вкладок. Без питомца — ничего не делает."""
    if not couple_id or reason not in REWARDS:
        return
    pet = await get_pet(s, couple_id)
    if pet:
        await _gain(s, pet, *REWARDS[reason])


async def hungry_line(s: AsyncSession, couple_id: int) -> str:
    """Строчка для утренней/вечерней рассылки."""
    pet = await get_pet(s, couple_id)
    if not pet or stage_for(pet.xp) == "egg":
        return ""
    apply_decay(pet, utcnow())
    await s.commit()
    if pet.food < 30:
        return f"\n\n{pet.name} проголодался — загляните покормить"
    if pet.joy < 30:
        return f"\n\n{pet.name} скучает — погладьте его"
    return ""


def walk_state(actions: list[PetAction], user: User, names: dict, now: datetime) -> dict:
    last_walk = next((x for x in actions if x.action == "walk"), None)
    if last_walk and (now - last_walk.at).total_seconds() < WALK_COOLDOWN:
        return {"state": "cooldown", "mins": int((WALK_COOLDOWN - (now - last_walk.at).total_seconds()) // 60) + 1}
    call = next((x for x in actions if x.action == "walk_call"), None)
    if call and (now - call.at).total_seconds() < WALK_WAIT and (not last_walk or last_walk.at < call.at):
        mins = int((WALK_WAIT - (now - call.at).total_seconds()) // 60) + 1
        if call.user_id == user.id:
            return {"state": "waiting", "mins": mins}
        return {"state": "invited", "mins": mins, "by": names.get(call.user_id, "?")}
    return {"state": "ready"}


def pet_out(pet: Pet, user: User, actions: list[PetAction], names: dict, ctx: dict | None = None) -> dict:
    now = utcnow()
    lvl = level_for(pet.xp)
    code, text = status_for(pet, user, **(ctx or {}))
    cooldowns = {}
    for a, (cd, *_rest) in ACTIONS.items():
        last = next((x.at for x in actions if x.user_id == user.id and x.action == a), None)
        cooldowns[a] = max(0, int(cd - (now - last).total_seconds())) if last else 0
    return {
        "kind": pet.kind, "emoji": KINDS.get(pet.kind, "🐾"), "name": pet.name,
        "food": round(pet.food), "joy": round(pet.joy), "xp": pet.xp,
        "level": lvl, "level_xp": pet.xp - level_start(lvl), "level_need": level_start(lvl + 1) - level_start(lvl),
        "stage": stage_for(pet.xp), "hatch_xp": HATCH_XP,
        "status": code, "status_text": text,
        "cooldowns": cooldowns,
        "walk": walk_state(actions, user, names, now),
        "log": [{"who": names.get(x.user_id, "?"), "action": x.action,
                 "ago_min": int((now - x.at).total_seconds() // 60)} for x in actions[:6]],
        "age_days": (now - pet.created_at).days if pet.created_at else 0,
    }


async def load(s: AsyncSession, user: User) -> dict:
    pet = await get_pet(s, user.couple_id)
    if not pet:
        return {"pet": None, "kinds": KINDS}
    apply_decay(pet, utcnow())
    await s.commit()
    actions = (await s.execute(select(PetAction).where(PetAction.pet_id == pet.id)
                               .order_by(PetAction.at.desc()).limit(30))).scalars().all()
    mem = await members(s, user.couple_id)
    names = {m.id: m.name for m in mem}
    return {"pet": pet_out(pet, user, actions, names, await mood_ctx(s, user.couple_id, mem)), "kinds": KINDS}


async def mood_ctx(s: AsyncSession, couple_id: int, mem: list[User]) -> dict:
    """Ночь и грустные настроения за сегодня без ответа — от них зависит, как ведёт себя питомец."""
    now_local = datetime.now(TZ)
    rows = (await s.execute(select(Mood).where(Mood.couple_id == couple_id, Mood.day == now_local.date()))).scalars().all()
    by_id = {m.id: m for m in mem}
    sad = [(by_id[m.user_id], m) for m in rows if m.emoji in SAD_MOODS and not m.reaction and m.user_id in by_id]
    return {"sad": sad, "night": is_night(now_local)}


@router.get("")
async def pet_get(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    return await load(s, user)


class PetIn(BaseModel):
    kind: str
    name: str = Field(min_length=1, max_length=40)


@router.post("")
async def pet_create(body: PetIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    if body.kind not in KINDS:
        raise HTTPException(400, "Неизвестный питомец")
    if await get_pet(s, user.couple_id):
        raise HTTPException(409, "Питомец уже есть")
    pet = Pet(couple_id=user.couple_id, kind=body.kind, name=body.name.strip(), food=80, joy=80, xp=0,
              updated_at=utcnow(), created_at=utcnow())
    s.add(pet)
    await s.commit()
    for m in await members(s, user.couple_id):
        if m.id != user.id:
            await notify(m.id, f"У вас появилось яйцо! Внутри — {pet.name}.\n"
                               f"Отмечайте настроение, добавляйте моменты, гладьте — и оно вылупится.",
                         button="Посмотреть", tab="pet")
    return await load(s, user)


class RenameIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)


@router.patch("")
async def pet_rename(body: RenameIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    pet = await get_pet(s, user.couple_id)
    if not pet:
        raise HTTPException(404)
    pet.name = body.name.strip()
    await s.commit()
    return await load(s, user)


@router.post("/walk")
async def pet_walk(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    """Совместная прогулка: один зовёт, второй подтверждает в течение часа."""
    pet = await get_pet(s, user.couple_id)
    if not pet:
        raise HTTPException(404, "Сначала заведите питомца")
    if stage_for(pet.xp) == "egg":
        raise HTTPException(400, "Яйцо гулять не умеет")
    actions = (await s.execute(select(PetAction).where(PetAction.pet_id == pet.id)
                               .order_by(PetAction.at.desc()).limit(30))).scalars().all()
    mem = await members(s, user.couple_id)
    names = {m.id: m.name for m in mem}
    st = walk_state(actions, user, names, utcnow())
    if st["state"] == "cooldown":
        raise HTTPException(429, f"{pet.name} ещё отдыхает после прогулки")
    if st["state"] == "waiting":
        raise HTTPException(409, "Ты уже позвал(а) — ждём ответа")
    others = [m for m in mem if m.id != user.id]
    if st["state"] == "invited":
        caller = next((x.user_id for x in actions if x.action == "walk_call"), None)
        s.add(PetAction(pet_id=pet.id, user_id=user.id, action="walk", at=utcnow()))
        await _gain(s, pet, *WALK_REWARD)
        if caller:
            await notify(caller, f"{user.name} пришёл(ла) — вы погуляли с {pet.name}! +{WALK_REWARD[1]} радости",
                         button="Посмотреть", tab="pet")
        return {**await load(s, user), "walked": True}
    s.add(PetAction(pet_id=pet.id, user_id=user.id, action="walk_call", at=utcnow()))
    await s.commit()
    for m in others:
        await notify(m.id, f"{user.name} зовёт гулять с {pet.name}. Подтверди в течение часа — "
                           f"погуляете вместе, и {pet.name} будет счастлив", button="Идём гулять", tab="pet")
    return {**await load(s, user), "called": True}


@router.post("/{action}")
async def pet_act(action: str, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    if action not in ACTIONS:
        raise HTTPException(404)
    pet = await get_pet(s, user.couple_id)
    if not pet:
        raise HTTPException(404, "Сначала заведите питомца")
    cd, food, joy, xp = ACTIONS[action]
    if action == "feed" and stage_for(pet.xp) == "egg":
        raise HTTPException(400, "Яйцо не ест — его можно только греть")
    last = (await s.execute(select(PetAction.at).where(
        PetAction.pet_id == pet.id, PetAction.user_id == user.id, PetAction.action == action)
        .order_by(PetAction.at.desc()).limit(1))).scalar_one_or_none()
    if last and (utcnow() - last).total_seconds() < cd:
        raise HTTPException(429, "Чуть позже — он ещё не соскучился" if action == "pet" else "Он ещё сытый")
    s.add(PetAction(pet_id=pet.id, user_id=user.id, action=action, at=utcnow()))
    await _gain(s, pet, food, joy, xp)
    return await load(s, user)
