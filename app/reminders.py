"""Напоминания отметить настроение: утром и вечером.

Render free засыпает, поэтому таймер внутри приложения ненадёжен. Расписание держит внешний
cron (cron-job.org), который в нужное время открывает
    GET /cron/mood?slot=morning&key=<CRON_SECRET>
    GET /cron/mood?slot=evening&key=<CRON_SECRET>
Повторный вызов в тот же день ничего не отправит — защита в таблице sent_log.
"""
import hmac

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from . import config
from .api import today
from .bot import notify
from .db import Mood, SentLog, Session, User

router = APIRouter()

TEXTS = {
    "morning": "☀️ Доброе утро, {name}! Как настроение?",
    "evening": "🌙 {name}, как прошёл день? Отметь настроение",
}


@router.api_route("/cron/mood", methods=["GET", "POST"])
async def mood_reminder(slot: str, key: str = "", force: bool = False):
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
    for members in by_couple.values():
        if len(members) < 2:
            continue
        for u in members:
            partner = next(m for m in members if m.id != u.id)
            text = TEXTS[slot].format(name=u.name)
            if slot == "evening" and u.id in mood_by_user:
                text = f"🌙 {u.name}, как прошёл день? Сегодня у тебя было {mood_by_user[u.id].emoji} — поменялось?"
            pm = mood_by_user.get(partner.id)
            if pm:
                note = f" — «{pm.note}»" if pm.note else ""
                text += f"\n\n{partner.name} сегодня: {pm.emoji}{note}"
            await notify(u.id, text, button="😊 Отметить", tab="mood")
            sent += 1
    return {"ok": True, "sent": sent}
