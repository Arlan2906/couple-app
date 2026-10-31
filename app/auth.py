"""Проверка подписи initData от Telegram Mini App.
https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qsl

from fastapi import Depends, Header, HTTPException

from . import config
from .db import AsyncSession, User, get_session

MAX_AGE = 7 * 24 * 3600  # initData старше недели не принимаем


def validate_init_data(init_data: str, bot_token: str) -> dict:
    pairs = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = pairs.pop("hash", None)
    if not received_hash:
        raise ValueError("no hash")
    check_string = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calc = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(calc, received_hash):
        raise ValueError("bad hash")
    if time.time() - int(pairs.get("auth_date", "0")) > MAX_AGE:
        raise ValueError("expired")
    return json.loads(pairs["user"])


async def current_user(
    x_init_data: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    if x_init_data:
        try:
            tg = validate_init_data(x_init_data, config.BOT_TOKEN)
        except (ValueError, KeyError, json.JSONDecodeError):
            raise HTTPException(401, "Неверная подпись Telegram")
        uid = int(tg["id"])
        name = tg.get("first_name") or tg.get("username") or "Без имени"
    elif config.DEV_USER_ID:
        uid, name = int(config.DEV_USER_ID), config.DEV_USER_NAME
    else:
        raise HTTPException(401, "Открой приложение через Telegram")

    user = await session.get(User, uid)
    if user is None:
        user = User(id=uid, name=name)
        session.add(user)
        await session.commit()
    elif user.name != name:
        user.name = name
        await session.commit()
    return user


async def paired_user(user: User = Depends(current_user)) -> User:
    if not user.couple_id:
        raise HTTPException(409, "Сначала свяжитесь в пару")
    return user
