import asyncio
import hashlib
import hmac
import logging
from contextlib import asynccontextmanager

from aiogram.types import Update
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .api import router
from .reminders import router as reminders_router
from .pet import router as pet_router
from .notes import router as notes_router
from .house import router as house_router
from .bot import bot, dp, setup_bot
from .db import init_db

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("main")
STATIC = config.BASE_DIR / "static"

WEBHOOK_PATH = "/tg/webhook"
# секрет выводится из токена, чтобы не заводить ещё одну переменную
WEBHOOK_SECRET = hashlib.sha256(f"webhook:{config.BOT_TOKEN}".encode()).hexdigest()[:48]


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    task = None
    if bot:
        await setup_bot()
        if config.BOT_MODE == "webhook":
            if not config.WEBAPP_URL:
                raise RuntimeError("Для webhook нужен WEBAPP_URL")
            await bot.set_webhook(f"{config.WEBAPP_URL}{WEBHOOK_PATH}", secret_token=WEBHOOK_SECRET,
                                  allowed_updates=dp.resolve_used_update_types(), drop_pending_updates=False)
            log.info("Бот: webhook %s%s", config.WEBAPP_URL, WEBHOOK_PATH)
        else:
            await bot.delete_webhook()
            task = asyncio.create_task(dp.start_polling(bot, handle_signals=False))
            log.info("Бот: polling")
    else:
        log.warning("BOT_TOKEN не задан — бот не запущен (режим разработки)")
    yield
    if task:
        await dp.stop_polling()
        task.cancel()
    if bot:
        await bot.session.close()


app = FastAPI(title=config.APP_TITLE, lifespan=lifespan)
app.include_router(router)
app.include_router(reminders_router)
app.include_router(pet_router)
app.include_router(notes_router)
app.include_router(house_router)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.post(WEBHOOK_PATH)
async def telegram_webhook(request: Request, x_telegram_bot_api_secret_token: str | None = Header(default=None)):
    if not bot or not hmac.compare_digest(x_telegram_bot_api_secret_token or "", WEBHOOK_SECRET):
        raise HTTPException(403)
    update = Update.model_validate(await request.json(), context={"bot": bot})
    await dp.feed_update(bot, update)
    return {"ok": True}


@app.api_route("/", methods=["GET", "HEAD"])
async def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


@app.api_route("/health", methods=["GET", "HEAD"])
async def health():
    return {"ok": True}
