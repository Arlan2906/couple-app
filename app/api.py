import secrets
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select

from . import config
from .bot import bot, load_photo, notify, store_photo
from .db import (AsyncSession, BucketItem, Couple, Deposit, Goal, Moment, Mood, User, Wish,
                 get_session)
from .auth import current_user, paired_user
from .pet import award

router = APIRouter(prefix="/api")
TZ = ZoneInfo(config.TIMEZONE)
MAX_PHOTO = 10 * 1024 * 1024


def today() -> date:
    return datetime.now(TZ).date()


async def partner_of(s: AsyncSession, user: User) -> User | None:
    if not user.couple_id:
        return None
    q = select(User).where(User.couple_id == user.couple_id, User.id != user.id)
    return (await s.execute(q)).scalar_one_or_none()


async def ping_partner(s: AsyncSession, user: User, text: str) -> None:
    p = await partner_of(s, user)
    if p:
        await notify(p.id, text)


async def read_photo(photo: UploadFile | None) -> bytes | None:
    if photo is None or not photo.filename:
        return None
    data = await photo.read()
    if len(data) > MAX_PHOTO:
        raise HTTPException(413, "Фото больше 10 МБ")
    if not (photo.content_type or "").startswith("image/"):
        raise HTTPException(415, "Это не картинка")
    return data


_bot_username: str | None = None


async def bot_username() -> str | None:
    global _bot_username
    if _bot_username is None and bot:
        _bot_username = (await bot.me()).username
    return _bot_username


# ---------- профиль и пара ----------

@router.get("/me")
async def me(user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    couple = await s.get(Couple, user.couple_id) if user.couple_id else None
    partner = await partner_of(s, user)
    started = couple.started_on if couple else None
    username = await bot_username()
    return {
        "id": user.id,
        "name": user.name,
        "title": config.APP_TITLE,
        "partner": {"id": partner.id, "name": partner.name} if partner else None,
        "couple": {
            "code": couple.code,
            "started_on": started.isoformat() if started else None,
            "started_time": couple.started_time,
            "tz_offset_min": int(datetime.now(TZ).utcoffset().total_seconds() // 60),
            "days_together": (today() - started).days + 1 if started else None,
            "invite_link": f"https://t.me/{username}?start=join_{couple.code}" if username else None,
        } if couple else None,
    }


@router.post("/pair/create")
async def pair_create(user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    if user.couple_id:
        raise HTTPException(409, "Ты уже в паре")
    couple = Couple(code=secrets.token_hex(3).upper())
    s.add(couple)
    await s.flush()
    user.couple_id = couple.id
    await s.commit()
    return {"code": couple.code}


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)


@router.post("/pair/join")
async def pair_join(body: JoinIn, user: User = Depends(current_user), s: AsyncSession = Depends(get_session)):
    if user.couple_id:
        raise HTTPException(409, "Ты уже в паре")
    couple = (await s.execute(select(Couple).where(Couple.code == body.code.strip().upper()))).scalar_one_or_none()
    if not couple:
        raise HTTPException(404, "Код не найден")
    count = (await s.execute(select(func.count()).select_from(User).where(User.couple_id == couple.id))).scalar()
    if count >= 2:
        raise HTTPException(409, "В этой паре уже двое")
    user.couple_id = couple.id
    await s.commit()
    await ping_partner(s, user, f"{user.name} присоединился(лась) к вашей паре!")
    return {"ok": True}


class CoupleIn(BaseModel):
    started_on: date | None
    started_time: str | None = Field(None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


@router.patch("/couple")
async def couple_update(body: CoupleIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    couple = await s.get(Couple, user.couple_id)
    couple.started_on = body.started_on
    couple.started_time = body.started_time
    await s.commit()
    return {"ok": True}


# ---------- фото ----------

@router.get("/photo/{file_id}")
async def photo(file_id: str):
    # file_id длинный и неугадываемый — работает как ссылка-ключ, поэтому <img> может грузить его без заголовков
    try:
        data = await load_photo(file_id)
    except Exception:
        raise HTTPException(404, "Фото не найдено")
    return Response(data, media_type="image/jpeg", headers={"Cache-Control": "private, max-age=86400"})


# ---------- Мы (таймлайн) ----------

def moment_out(m: Moment, names: dict) -> dict:
    return {"id": m.id, "title": m.title, "text": m.text, "happened_on": m.happened_on.isoformat(),
            "photo": m.photo_file_id, "author": names.get(m.author_id, "?"), "author_id": m.author_id}


async def couple_names(s: AsyncSession, couple_id: int) -> dict:
    rows = (await s.execute(select(User).where(User.couple_id == couple_id))).scalars().all()
    return {u.id: u.name for u in rows}


@router.get("/moments")
async def moments_list(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    q = select(Moment).where(Moment.couple_id == user.couple_id).order_by(Moment.happened_on.desc(), Moment.id.desc())
    names = await couple_names(s, user.couple_id)
    return [moment_out(m, names) for m in (await s.execute(q)).scalars()]


@router.post("/moments")
async def moments_create(
    title: str = Form(..., max_length=200),
    text: str = Form("", max_length=3000),
    happened_on: date = Form(...),
    photo: UploadFile | None = File(None),
    user: User = Depends(paired_user),
    s: AsyncSession = Depends(get_session),
):
    data = await read_photo(photo)
    file_id = await store_photo(user.id, data, photo.filename) if data else None
    m = Moment(couple_id=user.couple_id, author_id=user.id, title=title.strip(), text=text.strip(),
               happened_on=happened_on, photo_file_id=file_id)
    s.add(m)
    await s.commit()
    await award(s, user.couple_id, "moment")
    await ping_partner(s, user, f"{user.name} добавил(а) момент: «{m.title}»")
    return moment_out(m, {user.id: user.name})


@router.delete("/moments/{mid}")
async def moments_delete(mid: int, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    await s.execute(delete(Moment).where(Moment.id == mid, Moment.couple_id == user.couple_id))
    await s.commit()
    return {"ok": True}


# ---------- Вишлисты ----------

class WishIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    link: str = Field("", max_length=500)
    price: int | None = Field(None, ge=0)


@router.get("/wishes")
async def wishes_list(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    rows = (await s.execute(select(Wish).where(Wish.couple_id == user.couple_id).order_by(Wish.id.desc()))).scalars().all()
    mine, theirs = [], []
    for w in rows:
        base = {"id": w.id, "title": w.title, "link": w.link, "price": w.price, "received": w.received}
        if w.owner_id == user.id:
            mine.append(base)  # свою бронь не видишь — сюрприз!
        else:
            theirs.append({**base, "reserved": w.reserved_by is not None,
                           "reserved_by_me": w.reserved_by == user.id})
    return {"mine": mine, "partner": theirs}


@router.post("/wishes")
async def wishes_create(body: WishIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    w = Wish(couple_id=user.couple_id, owner_id=user.id, title=body.title.strip(),
             link=body.link.strip(), price=body.price)
    s.add(w)
    await s.commit()
    await award(s, user.couple_id, "wish")
    await ping_partner(s, user, f"В вишлисте {user.name} новое: «{w.title}»")
    return {"id": w.id}


async def get_wish(s: AsyncSession, wid: int, user: User) -> Wish:
    w = await s.get(Wish, wid)
    if not w or w.couple_id != user.couple_id:
        raise HTTPException(404, "Не найдено")
    return w


@router.post("/wishes/{wid}/reserve")
async def wishes_reserve(wid: int, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    w = await get_wish(s, wid, user)
    if w.owner_id == user.id:
        raise HTTPException(400, "Себе бронировать нельзя")
    if w.reserved_by and w.reserved_by != user.id:
        raise HTTPException(409, "Уже забронировано")
    w.reserved_by = None if w.reserved_by == user.id else user.id
    await s.commit()
    return {"reserved_by_me": w.reserved_by == user.id}


@router.post("/wishes/{wid}/received")
async def wishes_received(wid: int, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    w = await get_wish(s, wid, user)
    if w.owner_id != user.id:
        raise HTTPException(403, "Это не твоё желание")
    w.received = not w.received
    await s.commit()
    return {"received": w.received}


@router.delete("/wishes/{wid}")
async def wishes_delete(wid: int, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    w = await get_wish(s, wid, user)
    if w.owner_id != user.id:
        raise HTTPException(403, "Это не твоё желание")
    await s.delete(w)
    await s.commit()
    return {"ok": True}


# ---------- Настроение ----------

class MoodIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)
    note: str = Field("", max_length=300)


@router.get("/moods")
async def moods_list(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    since = today() - timedelta(days=13)
    rows = (await s.execute(select(Mood).where(Mood.couple_id == user.couple_id, Mood.day >= since))).scalars().all()
    partner = await partner_of(s, user)
    by = {(m.user_id, m.day): m for m in rows}
    days = []
    for i in range(14):
        d = today() - timedelta(days=i)
        me_m = by.get((user.id, d))
        p_m = by.get((partner.id, d)) if partner else None
        days.append({
            "day": d.isoformat(),
            "me": {"emoji": me_m.emoji, "note": me_m.note} if me_m else None,
            "partner": {"emoji": p_m.emoji, "note": p_m.note} if p_m else None,
        })
    return {"today": today().isoformat(), "days": days}


@router.put("/moods/today")
async def moods_set(body: MoodIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    d = today()
    m = (await s.execute(select(Mood).where(Mood.user_id == user.id, Mood.day == d))).scalar_one_or_none()
    first = m is None
    if first:
        m = Mood(couple_id=user.couple_id, user_id=user.id, day=d, emoji=body.emoji, note=body.note.strip())
        s.add(m)
    else:
        m.emoji, m.note = body.emoji, body.note.strip()
    await s.commit()
    note = f": «{m.note}»" if m.note else ""
    if first:
        await award(s, user.couple_id, "mood")
        partner = await partner_of(s, user)
        if partner and (await s.execute(select(Mood.id).where(Mood.user_id == partner.id, Mood.day == d))).first():
            await award(s, user.couple_id, "mood_both")
    await ping_partner(s, user, f"Настроение {user.name} сегодня: {m.emoji}{note}")
    return {"ok": True}


# ---------- Копилка ----------

class GoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    target: int = Field(gt=0)
    emoji: str = Field("", max_length=16)


class DepositIn(BaseModel):
    amount: int


async def goal_out(s: AsyncSession, g: Goal, names: dict) -> dict:
    deps = (await s.execute(select(Deposit).where(Deposit.goal_id == g.id).order_by(Deposit.id.desc()))).scalars().all()
    total = sum(d.amount for d in deps)
    by_user: dict[str, int] = {}
    for d in deps:
        by_user[names.get(d.user_id, "?")] = by_user.get(names.get(d.user_id, "?"), 0) + d.amount
    return {
        "id": g.id, "title": g.title, "emoji": g.emoji, "target": g.target, "total": total,
        "percent": min(100, round(total * 100 / g.target)) if g.target else 0,
        "by_user": by_user,
        "history": [{"who": names.get(d.user_id, "?"), "amount": d.amount,
                     "at": d.created_at.isoformat() if d.created_at else None} for d in deps[:10]],
    }


@router.get("/goals")
async def goals_list(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    names = await couple_names(s, user.couple_id)
    goals = (await s.execute(select(Goal).where(Goal.couple_id == user.couple_id).order_by(Goal.id))).scalars().all()
    return [await goal_out(s, g, names) for g in goals]


@router.post("/goals")
async def goals_create(body: GoalIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    g = Goal(couple_id=user.couple_id, title=body.title.strip(), target=body.target, emoji=body.emoji or "")
    s.add(g)
    await s.commit()
    await award(s, user.couple_id, "goal")
    await ping_partner(s, user, f"{user.name} создал(а) цель: «{g.title}» — {g.target:,} ₸".replace(",", " "))
    return {"id": g.id}


async def get_goal(s: AsyncSession, gid: int, user: User) -> Goal:
    g = await s.get(Goal, gid)
    if not g or g.couple_id != user.couple_id:
        raise HTTPException(404, "Цель не найдена")
    return g


@router.post("/goals/{gid}/deposit")
async def goals_deposit(gid: int, body: DepositIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    if body.amount == 0:
        raise HTTPException(400, "Сумма не может быть 0")
    g = await get_goal(s, gid, user)
    before = (await s.execute(select(func.coalesce(func.sum(Deposit.amount), 0)).where(Deposit.goal_id == g.id))).scalar()
    s.add(Deposit(goal_id=g.id, user_id=user.id, amount=body.amount))
    await s.commit()
    after = before + body.amount
    sign = "+" if body.amount > 0 else "−"
    amount = f"{abs(body.amount):,}".replace(",", " ")
    text = f"{user.name}: {sign}{amount} ₸ в «{g.title}»"
    for mark in (100, 75, 50, 25):
        if before * 100 < g.target * mark <= after * 100:
            text += f"\nЦель на {mark}%!" if mark < 100 else "\nЦель достигнута!"
            break
    if body.amount > 0:
        await award(s, user.couple_id, "deposit")
    await ping_partner(s, user, text)
    return {"total": after}


@router.delete("/goals/{gid}")
async def goals_delete(gid: int, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    g = await get_goal(s, gid, user)
    await s.execute(delete(Deposit).where(Deposit.goal_id == g.id))
    await s.delete(g)
    await s.commit()
    return {"ok": True}


# ---------- Бакет-лист ----------

class BucketIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)


def bucket_out(b: BucketItem, names: dict) -> dict:
    return {"id": b.id, "title": b.title, "done": b.done, "done_on": b.done_on.isoformat() if b.done_on else None,
            "photo": b.photo_file_id, "author": names.get(b.author_id, "?")}


@router.get("/bucket")
async def bucket_list(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    names = await couple_names(s, user.couple_id)
    q = select(BucketItem).where(BucketItem.couple_id == user.couple_id).order_by(BucketItem.done, BucketItem.id.desc())
    return [bucket_out(b, names) for b in (await s.execute(q)).scalars()]


@router.post("/bucket")
async def bucket_create(body: BucketIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    b = BucketItem(couple_id=user.couple_id, author_id=user.id, title=body.title.strip())
    s.add(b)
    await s.commit()
    await award(s, user.couple_id, "bucket_add")
    await ping_partner(s, user, f"{user.name} добавил(а) мечту: «{b.title}»")
    return {"id": b.id}


@router.post("/bucket/{bid}/toggle")
async def bucket_toggle(
    bid: int,
    photo: UploadFile | None = File(None),
    user: User = Depends(paired_user),
    s: AsyncSession = Depends(get_session),
):
    b = await s.get(BucketItem, bid)
    if not b or b.couple_id != user.couple_id:
        raise HTTPException(404, "Не найдено")
    b.done = not b.done
    b.done_on = today() if b.done else None
    if b.done:
        data = await read_photo(photo)
        if data:
            b.photo_file_id = await store_photo(user.id, data, photo.filename)
    await s.commit()
    if b.done:
        await award(s, user.couple_id, "bucket_done")
        await ping_partner(s, user, f"Сбылось: «{b.title}»!")
    return {"done": b.done}


@router.delete("/bucket/{bid}")
async def bucket_delete(bid: int, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    await s.execute(delete(BucketItem).where(BucketItem.id == bid, BucketItem.couple_id == user.couple_id))
    await s.commit()
    return {"ok": True}
