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


# ---------- разовые сообщения «что нового» ----------
# Открыть один раз: /cron/announce?v=<версия>&key=<CRON_SECRET>. Повторно та же версия не уйдёт.
ANNOUNCEMENTS = {
    "2026-11-13": """В нашем приложении обновление

1. Ответ на настроение. Когда один из нас отмечает настроение, второму приходит сообщение с кнопками «Обнять», «Позвоню вечером», «Скоро увидимся». Нажимаешь — и ответ сразу прилетает. То же самое можно сделать во вкладке «Настрой».

2. {pet} теперь живёт по часам. Ночью, с 23:00 до 7:00, спит. А если кому-то из нас грустно и второй ещё не ответил, он переживает и просит обнять.

3. Прогулка вдвоём. На вкладке «Питомец» можно позвать {pet} гулять. Второму приходит приглашение, и у него есть час, чтобы подтвердить. Тогда гуляем вместе, и {pet} становится намного счастливее.

4. Итоги недели. Каждое воскресенье в 21:00 придёт сообщение: какое у нас было настроение, что нового добавили, как дела у {pet}.

5. Праздники. В наши круглые даты — каждый месяц, каждые 100 дней — утром придёт поздравление, а в приложении будет праздничный баннер и гирлянда в доме {pet}.

6. Календарь настроения. История теперь спрятана под кнопкой «История настроения» во вкладке «Настрой». Нажимаешь — открывается календарь, нажимаешь на день — видно, что мы писали.

7. Приложение теперь открывается быстрее.""",
}


@router.api_route("/cron/announce", methods=["GET", "POST"])
async def announce(v: str, key: str = ""):
    if not config.CRON_SECRET or not hmac.compare_digest(key, config.CRON_SECRET):
        raise HTTPException(403)
    if v not in ANNOUNCEMENTS:
        raise HTTPException(404, "Нет такой версии")
    if not await once(f"announce:{v}", False):
        return {"ok": True, "skipped": "already sent"}
    from .pet import get_pet  # локально, как и в остальных модулях
    async with Session() as s:
        users = (await s.execute(select(User).where(User.couple_id.is_not(None)))).scalars().all()
        pets = {u.couple_id: await get_pet(s, u.couple_id) for u in users}
    sent = 0
    for u in users:
        pet = pets.get(u.couple_id)
        name = pet.name if pet else "питомец"
        await notify(u.id, ANNOUNCEMENTS[v].replace("{pet}", name), button="Посмотреть")
        sent += 1
    return {"ok": True, "sent": sent}
