"""Напоминания отметить настроение: утром и вечером.

Render free засыпает, поэтому таймер внутри приложения ненадёжен. Расписание держит внешний
cron (cron-job.org), который в нужное время открывает
    GET /cron/mood?slot=morning&key=<CRON_SECRET>
    GET /cron/mood?slot=evening&key=<CRON_SECRET>
Повторный вызов в тот же день ничего не отправит — защита в таблице sent_log.
Утром заодно уходят поздравления с круглыми датами, в воскресенье вечером — итоги недели
(проверить итоги в любой день: добавить &weekly=1&force=1).
"""
import hmac

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from . import config
from .api import today
from .bot import notify
from .dates import milestone
from .db import Couple, Mood, SentLog, Session, User
from .digest import weekly_text
from .pet import hungry_line
from .house import memory_line

router = APIRouter()

TEXTS = {
    "morning": "Доброе утро, {name}! Как настроение?",
    "evening": "{name}, как прошёл день? Отметь настроение",
}


@router.api_route("/cron/mood", methods=["GET", "POST"])
async def mood_reminder(slot: str, key: str = "", force: bool = False, weekly: bool = False):
    if not config.CRON_SECRET or not hmac.compare_digest(key, config.CRON_SECRET):
        raise HTTPException(403)
    if slot not in TEXTS:
        raise HTTPException(400, "slot = morning | evening")

    d = today()
    log_key = f"mood:{slot}:{d.isoformat()}"
    async with Session() as s:
        if not force and await s.get(SentLog, log_key):
            return {"ok": True, "skipped": "already sent"}
        s.add(SentLog(key=log_key))
        await s.commit()

        users = (await s.execute(select(User).where(User.couple_id.is_not(None)))).scalars().all()
        moods = (await s.execute(select(Mood).where(Mood.day == d))).scalars().all()
    mood_by_user = {m.user_id: m for m in moods}
    by_couple: dict[int, list[User]] = {}
    for u in users:
        by_couple.setdefault(u.couple_id, []).append(u)

    sent = 0
    for couple_id, members in by_couple.items():
        if len(members) < 2:
            continue
        await extras(slot, d, couple_id, members, force, weekly)
        async with Session() as s:
            pet_line = await hungry_line(s, couple_id)
            if slot == "morning":
                pet_line = await memory_line(s, couple_id, d) + pet_line
        for u in members:
            partner = next(m for m in members if m.id != u.id)
            text = TEXTS[slot].format(name=u.name)
            if slot == "evening" and u.id in mood_by_user:
                text = f"{u.name}, как прошёл день? Сегодня у тебя было {mood_by_user[u.id].emoji} — поменялось?"
            pm = mood_by_user.get(partner.id)
            if pm:
                note = f" — «{pm.note}»" if pm.note else ""
                text += f"\n\n{partner.name} сегодня: {pm.emoji}{note}"
            await notify(u.id, text + pet_line, button="Отметить", tab="mood")
            sent += 1
    return {"ok": True, "sent": sent}


async def once(key: str, force: bool) -> bool:
    """True, если по этому ключу ещё не отправляли (и сразу помечаем как отправленное)."""
    async with Session() as s:
        if not force and await s.get(SentLog, key):
            return False
        if not await s.get(SentLog, key):
            s.add(SentLog(key=key))
            await s.commit()
    return True


async def extras(slot: str, d, couple_id: int, members: list[User], force: bool, weekly: bool = False) -> None:
    """Утром — круглые даты, в воскресенье вечером — итоги недели."""
    if slot == "morning":
        async with Session() as s:
            couple = await s.get(Couple, couple_id)
        ms = milestone(couple.started_on if couple else None, d)
        if ms and await once(f"ms:{couple_id}:{d.isoformat()}", force):
            for u in members:
                await notify(u.id, f"{ms['text']}!\n\nС праздником вас. Загляните в приложение — "
                                   f"там сегодня празднично", button="Открыть", tab="us")
    if (weekly or (slot == "evening" and d.weekday() == 6)) and await once(f"week:{couple_id}:{d.isoformat()}", force):
        async with Session() as s:
            text = await weekly_text(s, couple_id, members, d)
        for u in members:
            await notify(u.id, text, button="Открыть")
