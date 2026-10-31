import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
# Публичный HTTPS-адрес, где открыт Mini App (например https://xxx.up.railway.app)
WEBAPP_URL = os.getenv("WEBAPP_URL", "").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'data' / 'couple.db'}")
# Railway/Heroku отдают postgres://, SQLAlchemy нужен async-драйвер
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Только для локальной разработки в обычном браузере: подставляет этого пользователя без Telegram.
DEV_USER_ID = os.getenv("DEV_USER_ID")
DEV_USER_NAME = os.getenv("DEV_USER_NAME", "Dev")

APP_TITLE = os.getenv("APP_TITLE", "Арлан & Настя")
TIMEZONE = os.getenv("TIMEZONE", "Asia/Almaty")
