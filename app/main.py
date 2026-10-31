import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config
from .api import router
from .bot import bot, dp, setup_bot
from .db import init_db

logging.basicConfig(level=logging.INFO)
STATIC = config.BASE_DIR / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    task = None
    if bot:
        await setup_bot()
        # Бот работает в том же процессе через long polling — не нужен вебхук и отдельный сервис
        task = asyncio.create_task(dp.start_polling(bot, handle_signals=False))
    else:
        logging.warning("BOT_TOKEN не задан — бот не запущен (режим разработки)")
    yield
    if task:
        await dp.stop_polling()
        task.cancel()
    if bot:
        await bot.session.close()


app = FastAPI(title=config.APP_TITLE, lifespan=lifespan)
app.include_router(router)
app.mount("/static", StaticFiles(directory=STATIC), name="static")


@app.get("/")
async def index():
    return FileResponse(STATIC / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/health")
async def health():
    return {"ok": True}
