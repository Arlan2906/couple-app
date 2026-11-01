"""Тамагочи пары.

Сытость и радость медленно убывают со временем. Питомец растёт (опыт → уровень) от всего,
что вы делаете в приложении: отмечаете настроение, добавляете моменты, копите, сбываете мечты.
Плюс прямые действия: покормить и погладить (с перезарядкой у каждого своей).
Питомец никогда не умирает — только грустит, если про него забыли.
"""
import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from .auth import paired_user
from .bot import notify
from .db import AsyncSession, Pet, PetAction, User, get_session

router = APIRouter(prefix="/api/pet")

KINDS = {"cat": "🐱", "dog": "🐶", "fox": "🦊", "panda": "🐼", "bunny": "🐰",
         "hamster": "🐹", "penguin": "🐧", "dragon": "🐲"}

FOOD_DECAY_PER_H = 2.0      # от полной сытости до нуля ~2 суток
JOY_DECAY_PER_H = 1.5
HATCH_XP = 30               # яйцо вылупляется после нескольких действий
ACTIONS = {                 # перезарядка (сек), сытость, радость, опыт
    "feed": (3 * 3600, 22, 3, 3),
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
}


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


def status_for(pet: Pet) -> tuple[str, str]:
    if stage_for(pet.xp) == "egg":
        return "egg", "Тёплое яйцо. Кажется, внутри кто-то шевелится…"
    if pet.food < 10 and pet.joy < 10:
        return "sad", "Совсем загрустил и проголодался 🥺"
    if pet.food < 25:
        return "hungry", "Урчит животик — покормите!"
    if pet.joy < 25:
        return "bored", "Скучает по вам. Погладьте!"
    if pet.food > 70 and pet.joy > 70:
        return "happy", "Счастлив и сыт 💞"
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
        news = f"🐣 Ура! {pet.name} вылупился! {KINDS.get(pet.kind, '')}\nТеперь его нужно кормить и гладить."
    elif not was_egg and level_for(pet.xp) > old_level:
        news = f"⭐ {pet.name} вырос до {level_for(pet.xp)} уровня!"
        if stage_for(pet.xp) != stage_for(pet.xp - xp):
            news += " Смотрите, как он изменился 👀"
    if news:
        for m in await members(s, pet.couple_id):
            await notify(m.id, news, button="🐾 Посмотреть", tab="pet")


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
        return f"\n\n🥺 {pet.name} проголодался — загляните покормить"
    if pet.joy < 30:
        return f"\n\n🥺 {pet.name} скучает — погладьте его"
    return ""


def pet_out(pet: Pet, user: User, actions: list[PetAction], names: dict) -> dict:
    now = utcnow()
    lvl = level_for(pet.xp)
    code, text = status_for(pet)
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
    names = {m.id: m.name for m in await members(s, user.couple_id)}
    return {"pet": pet_out(pet, user, actions, names), "kinds": KINDS}


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
            await notify(m.id, f"🥚 У вас появилось яйцо! Внутри — {pet.name}.\n"
                               f"Отмечайте настроение, добавляйте моменты, гладьте — и оно вылупится.",
                         button="🐾 Посмотреть", tab="pet")
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


@router.post("/{action}")
async def pet_act(action: str, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    if action not in ACTIONS:
        raise HTTPException(404)
    pet = await get_pet(s, user.couple_id)
    if not pet:
        raise HTTPException(404, "Сначала заведите питомца")
    cd, food, joy, xp = ACTIONS[action]
    if action == "feed" and stage_for(pet.xp) == "egg":
        raise HTTPException(400, "Яйцо не ест — его можно только греть 🤲")
    last = (await s.execute(select(PetAction.at).where(
        PetAction.pet_id == pet.id, PetAction.user_id == user.id, PetAction.action == action)
        .order_by(PetAction.at.desc()).limit(1))).scalar_one_or_none()
    if last and (utcnow() - last).total_seconds() < cd:
        raise HTTPException(429, "Чуть позже — он ещё не соскучился 🙂" if action == "pet" else "Он ещё сытый 🙂")
    s.add(PetAction(pet_id=pet.id, user_id=user.id, action=action, at=utcnow()))
    await _gain(s, pet, food, joy, xp)
    return await load(s, user)
