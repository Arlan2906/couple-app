"""Круглые даты отношений: месяцы, годы, каждые 100 дней."""
import calendar
from datetime import date


def _plural(n: int, one: str, few: str, many: str) -> str:
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


def milestone(started: date | None, d: date) -> dict | None:
    """Что сегодня празднуем. День знакомства считается первым днём, как в счётчике «вместе»."""
    if not started or d <= started:
        return None
    days = (d - started).days + 1
    months = (d.year - started.year) * 12 + (d.month - started.month)
    anchor = min(started.day, calendar.monthrange(d.year, d.month)[1])  # 31-е → последний день короткого месяца
    if months >= 1 and d.day == anchor:
        if months % 12 == 0:
            y = months // 12
            return {"kind": "year", "n": y, "text": f"Сегодня {y} {_plural(y, 'год', 'года', 'лет')} вместе"}
        return {"kind": "month", "n": months,
                "text": f"Сегодня {months} {_plural(months, 'месяц', 'месяца', 'месяцев')} вместе"}
    if days % 100 == 0:
        return {"kind": "days", "n": days, "text": f"Сегодня {days} дней вместе"}
    return None
