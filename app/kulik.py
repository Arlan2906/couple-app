"""Всё «живое» вокруг питомца: трюки и гардероб по уровням, праздник нового уровня,
альбом «Как рос», дневник от его лица, конверты «через Кулика», погода и день рождения."""
import calendar
import random
import time
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from .auth import paired_user
from .bot import notify
from .db import AsyncSession, Moment, Mood, Note, Pet, PetAction, PetLevel, User, get_session
from .pet import TZ, _gain, get_pet, level_for, load, members, stage_for, utcnow

router = APIRouter(prefix="/api/kulik")

# уровень → трюк (id, что делает)
TRICKS = {2: ("paw", "даёт лапу"), 3: ("spin", "кружится"), 4: ("roll", "переворачивается"), 5: ("fetch", "приносит мячик"),
          6: ("beg", "служит на задних лапах"), 7: ("dead", "падает понарошку"), 8: ("dance", "танцует"),
          9: ("sing", "поёт"), 10: ("bow", "кланяется")}
# id, слот, название, уровень
WARDROBE = [("bandana", "neck", "Бандана", 2), ("scarf", "neck", "Шарф", 3), ("bow", "neck", "Бабочка", 4),
            ("cap", "head", "Кепка", 5), ("glasses", "head", "Очки", 6), ("sweater", "neck", "Свитер", 7),
            ("santa", "head", "Новогодняя шапка", 8), ("flower", "head", "Цветок за ухом", 9), ("crown", "head", "Корона", 10)]
WARD = {w[0]: w for w in WARDROBE}
ROOM_LEVELS = {1: "гостиная", 3: "кухня", 5: "сад", 8: "чердак со звёздами"}
CARRY = {"kiss": "воздушный поцелуй", "miss": "«скучаю»", "hug": "обнимашки", "love": "«люблю»"}
CARRY_COOLDOWN = 3 * 60


def unlocked_between(a: int, b: int) -> dict:
    """Что открылось на уровнях (a, b]."""
    return {"tricks": [{"level": lv, "id": t[0], "name": t[1]} for lv, t in TRICKS.items() if a < lv <= b],
            "clothes": [{"id": w[0], "name": w[2], "level": w[3]} for w in WARDROBE if a < w[3] <= b],
            "rooms": [{"level": lv, "name": n} for lv, n in ROOM_LEVELS.items() if a < lv <= b and lv > 1]}


def level_news(old: int, new: int) -> str:
    u = unlocked_between(old, new)
    parts = [f"научился: {t['name']}" for t in u["tricks"]] + [f"в гардеробе — {c['name'].lower()}" for c in u["clothes"]] \
        + [f"открылась {r['name']}" for r in u["rooms"]]
    return ("\n" + "; ".join(parts).capitalize() + ".") if parts else ""


# ---------- погода в Алматы (open-meteo, без ключа), кэш на 30 минут ----------
_weather: dict = {"at": 0.0, "data": None}


async def weather() -> dict | None:
    if time.time() - _weather["at"] < 1800:
        return _weather["data"]
    data = None
    try:
        import aiohttp
        url = ("https://api.open-meteo.com/v1/forecast?latitude=43.24&longitude=76.89"
               "&current=temperature_2m,weather_code&timezone=Asia%2FAlmaty")
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=6)) as http:
            async with http.get(url) as r:
                cur = (await r.json())["current"]
        code, temp = int(cur["weather_code"]), float(cur["temperature_2m"])
        kind = ("snow" if code in (71, 73, 75, 77, 85, 86) else "rain" if code in (51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82)
                else "storm" if code >= 95 else "fog" if code in (45, 48) else "cloud" if code in (2, 3) else "clear")
        data = {"kind": kind, "temp": round(temp)}
    except Exception:
        data = _weather["data"]  # не получилось — оставим прошлое значение
    _weather.update(at=time.time(), data=data)
    return data


# ---------- день рождения ----------
def local_date(dt: datetime | None) -> date | None:
    return (dt.replace(tzinfo=timezone.utc).astimezone(TZ).date()) if dt else None


def _pl(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def birthday(pet: Pet, d: date) -> dict | None:
    born = local_date(pet.created_at)
    if not born or d <= born:
        return None
    months = (d.year - born.year) * 12 + (d.month - born.month)
    if months < 1 or d.day != min(born.day, calendar.monthrange(d.year, d.month)[1]):
        return None
    if months % 12 == 0:
        y = months // 12
        return {"kind": "year", "n": y, "text": f"День рождения: {pet.name} с вами {y} {_pl(y, 'год', 'года', 'лет')}!"}
    return {"kind": "month", "n": months, "text": f"Праздник: {pet.name} с вами {months} {_pl(months, 'месяц', 'месяца', 'месяцев')}!"}


# ---------- дополнительные поля в /api/pet ----------
async def extras(s: AsyncSession, pet: Pet, user: User) -> dict:
    egg = stage_for(pet.xp) == "egg"
    lvl = 0 if egg else level_for(pet.xp)
    seen = user.pet_seen_level or 0
    levelup = None
    if lvl > seen:
        levelup = {"from": seen, "to": lvl, **unlocked_between(seen, lvl)}
    today = datetime.now(TZ).date()
    return {
        "tricks": [{"level": lv, "id": t[0], "name": t[1]} for lv, t in TRICKS.items() if lv <= lvl],
        "next_trick": next(({"level": lv, "name": t[1]} for lv, t in TRICKS.items() if lv > lvl), None),
        "wardrobe": [{"id": w[0], "slot": w[1], "name": w[2], "level": w[3], "unlocked": lvl >= w[3]} for w in WARDROBE],
        "outfit": {"head": pet.outfit_head, "neck": pet.outfit_neck},
        "levelup": levelup,
        "weather": await weather(),
        "birthday": birthday(pet, today),
        "carry": CARRY,
    }


@router.post("/seen")
async def seen(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    pet = await get_pet(s, user.couple_id)
    if pet:
        u = await s.get(User, user.id)
        u.pet_seen_level = 0 if stage_for(pet.xp) == "egg" else level_for(pet.xp)
        await s.commit()
    return {"ok": True}


class OutfitIn(BaseModel):
    slot: str
    item: str | None = None


@router.patch("/outfit")
async def outfit(body: OutfitIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    pet = await get_pet(s, user.couple_id)
    if not pet or stage_for(pet.xp) == "egg":
        raise HTTPException(400, "Сначала пусть вылупится")
    if body.slot not in ("head", "neck"):
        raise HTTPException(400, "Нет такого места")
    if body.item:
        w = WARD.get(body.item)
        if not w or w[1] != body.slot:
            raise HTTPException(400, "Нет такой вещи")
        if level_for(pet.xp) < w[3]:
            raise HTTPException(400, f"Откроется на {w[3]} уровне")
    setattr(pet, f"outfit_{body.slot}", body.item or None)
    await s.commit()
    return await load(s, user)


class CarryIn(BaseModel):
    kind: str


@router.post("/carry")
async def carry(body: CarryIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    """Кулик несёт второму конверт: поцелуй, «скучаю», обнимашки или «люблю»."""
    if body.kind not in CARRY:
        raise HTTPException(400, "Не знаю такого")
    pet = await get_pet(s, user.couple_id)
    if not pet or stage_for(pet.xp) == "egg":
        raise HTTPException(400, "Яйцо ещё не умеет носить конверты")
    last = (await s.execute(select(PetAction.at).where(PetAction.pet_id == pet.id, PetAction.user_id == user.id,
                                                       PetAction.action.like("carry_%")).order_by(PetAction.at.desc()).limit(1))).scalar()
    if last and (utcnow() - last).total_seconds() < CARRY_COOLDOWN:
        raise HTTPException(429, f"{pet.name} ещё бежит с прошлым конвертом")
    s.add(PetAction(pet_id=pet.id, user_id=user.id, action=f"carry_{body.kind}", at=utcnow()))
    await _gain(s, pet, 0, 3, 0)
    for m in await members(s, user.couple_id):
        if m.id != user.id:
            await notify(m.id, f"{pet.name} прибежал с конвертом в зубах.\nВнутри — {CARRY[body.kind]}. Отправитель: {user.name}",
                         button="Погладить почтальона", tab="pet")
    return {**await load(s, user), "sent": True}


@router.get("/album")
async def album(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    pet = await get_pet(s, user.couple_id)
    if not pet or stage_for(pet.xp) == "egg":
        return {"levels": []}
    cur = level_for(pet.xp)
    rows = {r.level: r for r in (await s.execute(select(PetLevel).where(PetLevel.pet_id == pet.id))).scalars()}
    out = []
    for lv in range(1, cur + 1):
        r = rows.get(lv)
        t = TRICKS.get(lv)
        cl = next((w[2] for w in WARDROBE if w[3] == lv), None)
        stage = "baby" if lv <= 2 else "kid" if lv <= 5 else "adult" if lv <= 9 else "legend"
        out.append({"level": lv, "date": local_date(r.at).isoformat() if r and r.at else None, "stage": stage,
                    "trick": t[1] if t else None, "trick_id": t[0] if t else None, "cloth": cl,
                    "cloth_id": next((w[0] for w in WARDROBE if w[3] == lv), None)})
    return {"levels": out, "name": pet.name}


# ---------- дневник от лица питомца ----------
def _pick(rnd: random.Random, *v: str) -> str:
    return rnd.choice(v)


@router.get("/diary")
async def diary(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    pet = await get_pet(s, user.couple_id)
    if not pet or stage_for(pet.xp) == "egg":
        return {"days": []}
    mem = await members(s, user.couple_id)
    names = {m.id: m.name for m in mem}
    today = datetime.now(TZ).date()
    start = today - timedelta(days=6)
    utc0 = datetime.combine(start, datetime.min.time()) - timedelta(hours=5)
    acts = (await s.execute(select(PetAction).where(PetAction.pet_id == pet.id, PetAction.at >= utc0))).scalars().all()
    moods = (await s.execute(select(Mood).where(Mood.couple_id == pet.couple_id, Mood.day >= start))).scalars().all()
    moments = (await s.execute(select(Moment).where(Moment.couple_id == pet.couple_id, Moment.happened_on >= start))).scalars().all()
    notes = (await s.execute(select(Note.created_at).where(Note.couple_id == pet.couple_id, Note.created_at >= utc0))).scalars().all()
    levels = (await s.execute(select(PetLevel).where(PetLevel.pet_id == pet.id, PetLevel.at >= utc0))).scalars().all()
    born = local_date(pet.created_at)
    sad = {"😔", "😢", "😤", "🤒", "🤯", "🫠"}
    days = []
    for k in range(7):
        d = today - timedelta(days=k)
        if born and d < born:
            break
        rnd = random.Random(f"{pet.id}:{d.isoformat()}")
        a = [x for x in acts if local_date(x.at) == d]
        who = lambda act: list(dict.fromkeys(names.get(x.user_id, "?") for x in a if x.action == act))  # noqa: E731
        lines = []
        for lv in sorted(x.level for x in levels if local_date(x.at) == d):
            t = TRICKS.get(lv)
            lines.append(f"Я вырос до {lv} уровня!" + (f" И научился: {t[1]}." if t else ""))
        bd = birthday(pet, d)
        if bd:
            lines.append("У меня сегодня праздник — " + ("день рождения!" if bd["kind"] == "year" else f"мне {bd['n']} мес.!"))
        f = who("feed")
        if len(f) > 1:
            lines.append(_pick(rnd, f"{f[0]} и {f[1]} кормили меня по очереди. Я сыт!", "Меня кормили оба — живот круглый, как мячик."))
        elif f:
            lines.append(_pick(rnd, f"{f[0]} не забывает меня кормить — было вкусно.", f"Обед мне сегодня выдавал(а) {f[0]}. Спасибо!"))
        p = who("pet")
        if len(p) > 1:
            lines.append(_pick(rnd, "Меня гладили оба — двойное счастье.", "Почесали и за ухом, и по пузику. Я таю."))
        elif p:
            lines.append(_pick(rnd, f"{p[0]} гладит меня лучше всех.", f"{p[0]} почесал(а) мне за ухом. Хвост до сих пор виляет."))
        if any(x.action == "walk" for x in a):
            lines.append(_pick(rnd, "Гуляли все вместе! Лучшая часть дня.", "Была прогулка втроём — нюхал всё подряд."))
        elif any(x.action == "walk_call" for x in a):
            lines.append("Меня звали гулять, но прогулка не сложилась. Жду следующую.")
        sent = [x.action[6:] for x in a if x.action.startswith("carry_")]
        if sent:
            lines.append("Работал почтальоном: носил " + ", ".join(dict.fromkeys(CARRY.get(c, c) for c in sent)) + ".")
        dm = [m for m in moods if m.day == d]
        if any(m.emoji in sad for m in dm):
            lines.append("Кому-то из вас было грустно. Я лежал рядом и грел.")
        elif len({m.user_id for m in dm}) >= 2:
            lines.append(_pick(rnd, "Вы оба отметили настроение — я всё видел.", "Вы рассказали, как дела. Мне тоже интересно!"))
        for m in [m for m in moments if m.happened_on == d][:2]:
            lines.append(f"Вы добавили момент «{m.title}». Повешу в рамку!")
        if any(local_date(n) == d for n in notes):
            lines.append("Кто-то написал записку в «Несказанное». Я не подглядывал. Почти.")
        if not lines:
            lines.append(_pick(rnd, "Скучал весь день. Где вы были?", "Тихий день. Спал, ждал, снова спал.",
                               "Сегодня никто не заходил. Я грыз тапок от скуки."))
        days.append({"date": d.isoformat(), "text": " ".join(lines[:4])})
    return {"days": days, "name": pet.name}
