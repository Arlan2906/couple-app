import io
import logging
import uuid
from collections import OrderedDict

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (BufferedInputFile, InlineKeyboardButton, InlineKeyboardMarkup,
                           MenuButtonWebApp, Message, WebAppInfo)
from sqlalchemy import select

from . import config
from .db import Couple, Session, User

log = logging.getLogger("bot")

bot: Bot | None = Bot(config.BOT_TOKEN) if config.BOT_TOKEN else None
dp = Dispatcher()

UPLOADS = config.BASE_DIR / "data" / "uploads"


def open_app_kb(text: str = "💞 Открыть") -> InlineKeyboardMarkup | None:
    if not config.WEBAPP_URL:
        return None
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=text, web_app=WebAppInfo(url=config.WEBAPP_URL))
    ]])


@dp.message(CommandStart())
async def on_start(message: Message, command: CommandObject):
    uid = message.from_user.id
    name = message.from_user.first_name or "Без имени"
    async with Session() as s:
        user = await s.get(User, uid) or User(id=uid, name=name)
        s.add(user)
        text = f"Привет, {name}! Это ваше общее место — {config.APP_TITLE} 💞"

        arg = (command.args or "").strip()
        if arg.startswith("join_") and not user.couple_id:
            code = arg.removeprefix("join_").upper()
            couple = (await s.execute(select(Couple).where(Couple.code == code))).scalar_one_or_none()
            members = []
            if couple:
                members = (await s.execute(select(User).where(User.couple_id == couple.id))).scalars().all()
            if couple and len(members) < 2:
                user.couple_id = couple.id
                text += "\n\nВы связаны в пару ✨"
                for m in members:
                    await notify(m.id, f"💞 {name} присоединился(лась) к вашей паре!")
            else:
                text += "\n\nКод приглашения не подошёл 😕"
        await s.commit()
    await message.answer(text, reply_markup=open_app_kb())


@dp.message(F.text)
async def fallback(message: Message):
    await message.answer("Всё живёт в приложении 👇", reply_markup=open_app_kb())


async def setup_bot() -> None:
    if not bot or not config.WEBAPP_URL:
        return
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text="💞 Мы", web_app=WebAppInfo(url=config.WEBAPP_URL))
    )


async def notify(user_id: int, text: str) -> None:
    if not bot:
        log.info("notify %s: %s", user_id, text)
        return
    try:
        await bot.send_message(user_id, text, reply_markup=open_app_kb())
    except Exception as e:  # партнёр мог не нажать /start или заблокировать бота
        log.warning("notify failed for %s: %s", user_id, e)


async def store_photo(uploader_id: int, data: bytes, filename: str) -> str:
    """Возвращает id фото. В проде — Telegram file_id (хранение бесплатное),
    локально без бота — файл в data/uploads."""
    if not bot:
        UPLOADS.mkdir(parents=True, exist_ok=True)
        name = f"{uuid.uuid4().hex}.jpg"
        (UPLOADS / name).write_bytes(data)
        return f"local:{name}"
    msg = await bot.send_photo(uploader_id, BufferedInputFile(data, filename or "photo.jpg"),
                               disable_notification=True)
    file_id = msg.photo[-1].file_id
    try:
        await bot.delete_message(uploader_id, msg.message_id)
    except Exception:
        pass
    return file_id


_cache: OrderedDict[str, bytes] = OrderedDict()


async def load_photo(file_id: str) -> bytes:
    if file_id.startswith("local:"):
        return (UPLOADS / file_id.removeprefix("local:")).read_bytes()
    if file_id in _cache:
        _cache.move_to_end(file_id)
        return _cache[file_id]
    f = await bot.get_file(file_id)
    buf = io.BytesIO()
    await bot.download_file(f.file_path, buf)
    data = buf.getvalue()
    _cache[file_id] = data
    if len(_cache) > 60:
        _cache.popitem(last=False)
    return data
