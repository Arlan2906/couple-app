import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
# Публичный HTTPS-адрес, где открыт Mini App (например https://xxx.up.railway.app)
WEBAPP_URL = os.getenv("WEBAPP_URL", "").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'couple.db'}"
DB_SSL = False
# Neon/Render/Railway отдают postgres(ql)://...?sslmode=require — asyncpg эти параметры не понимает
if DATABASE_URL.startswith(("postgres://", "postgresql://")):
    from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

    parts = urlsplit(DATABASE_URL)
    query = dict(parse_qsl(parts.query))
    DB_SSL = query.pop("sslmode", "disable") not in ("disable", "allow", "prefer")
    query.pop("channel_binding", None)
    DATABASE_URL = urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, urlencode(query), ""))

# webhook — для хостингов, которые засыпают (Render free); polling — локально
BOT_MODE = os.getenv("BOT_MODE", "webhook" if os.getenv("RENDER") else "polling")

# Только для локальной разработки в обычном браузере: подставляет этого пользователя без Telegram.
DEV_USER_ID = os.getenv("DEV_USER_ID")
DEV_USER_NAME = os.getenv("DEV_USER_NAME", "Dev")

APP_TITLE = os.getenv("APP_TITLE", "Арлан & Настя")
TIMEZONE = os.getenv("TIMEZONE", "Asia/Almaty")
