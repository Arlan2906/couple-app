"""Итоги недели — уходят обоим в воскресенье вместе с вечерним напоминанием."""
from collections import Counter
from datetime import date, datetime, time, timedelta

from sqlalchemy import func, select

from .db import AsyncSession, Deposit, Goal, Moment, Mood, Note, PetUnlock, User
from .house import describe
from .pet import apply_decay, get_pet, level_for, stage_for, utcnow


def _days(n: int) -> str:
    return "день" if n % 10 == 1 and n % 100 != 11 else "дня" if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14 else "дней"


async def weekly_text(s: AsyncSession, couple_id: int, members: list[User], d: date) -> str:
    start = d - timedelta(days=6)
    start_dt = datetime.combine(start, time.min) - timedelta(hours=5)  # начало недели по Алматы в UTC
    lines = ["Итоги недели"]

    moods = (await s.execute(select(Mood).where(Mood.couple_id == couple_id, Mood.day >= start,
                                                Mood.day <= d))).scalars().all()
    for u in members:
        mine = [m.emoji for m in moods if m.user_id == u.id]
        if mine:
            top, cnt = Counter(mine).most_common(1)[0]
            lines.append(f"{u.name}: отмечал(а) {len(mine)} из 7 дней, чаще всего {top}")
        else:
            lines.append(f"{u.name}: ни разу не отметил(а) настроение")
    per_day = Counter(m.day for m in moods)
    both = sum(1 for c in per_day.values() if c >= 2)
    if both:
        lines.append(f"Отметились оба: {both} {_days(both)} из 7")

    moments = (await s.execute(select(Moment.title).where(Moment.couple_id == couple_id, Moment.happened_on >= start,
                                                          Moment.happened_on <= d))).scalars().all()
    if moments:
        lines.append("Новые моменты: " + ", ".join(f"«{t}»" for t in moments[:4]) + (" и ещё" if len(moments) > 4 else ""))

    saved = (await s.execute(select(func.coalesce(func.sum(Deposit.amount), 0)).select_from(Deposit)
                             .join(Goal, Goal.id == Deposit.goal_id)
                             .where(Goal.couple_id == couple_id, Deposit.created_at >= start_dt))).scalar() or 0
    if saved:
        lines.append(f"Копилка: {'+' if saved > 0 else ''}{saved:,} ₸".replace(",", " "))

    notes = (await s.execute(select(func.count()).select_from(Note).where(
        Note.couple_id == couple_id, Note.created_at >= start_dt))).scalar() or 0
    if notes:
        lines.append(f"Записок в «Несказанном»: {notes}")

    pet = await get_pet(s, couple_id)
    if pet and stage_for(pet.xp) != "egg":
        apply_decay(pet, utcnow())
        await s.commit()
        line = f"{pet.name}: {level_for(pet.xp)} уровень, сытость {round(pet.food)}%, радость {round(pet.joy)}%"
        new = (await s.execute(select(PetUnlock.item_id).where(PetUnlock.pet_id == pet.id,
                                                               PetUnlock.created_at >= start_dt))).scalars().all()
        if new:
            line += "\nВ доме появилось: " + ", ".join(describe(i) for i in new[:5])
        lines.append(line)

    return lines[0] + "\n\n" + "\n".join(lines[1:])
