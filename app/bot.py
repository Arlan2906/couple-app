import io
import logging
import uuid
from collections import OrderedDict

from aiogram import Bot, Dispatcher, F
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import (BufferedInputFile, CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup,
                           MenuButtonWebApp, Message, WebAppInfo)
from sqlalchemy import select

from . import config
from .db import Couple, Mood, Session, User

log = logging.getLogger("bot")

bot: Bot | None = Bot(config.BOT_TOKEN) if config.BOT_TOKEN else None
dp = Dispatcher()

UPLOADS = config.BASE_DIR / "data" / "uploads"


def open_app_kb(text: str = "Открыть", tab: str | None = None) -> InlineKeyboardMarkup | None:
    if not config.WEBAPP_URL:
        return None
    url = f"{config.WEBAPP_URL}/?tab={tab}" if tab else config.WEBAPP_URL
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text=text, web_app=WebAppInfo(url=url))
    ]])


@dp.message(CommandStart())
async def on_start(message: Message, command: CommandObject):
    uid = message.from_user.id
    name = message.from_user.first_name or "Без имени"
    async with Session() as s:
        user = await s.get(User, uid) or User(id=uid, name=name)
        s.add(user)
        text = f"Привет, {name}! Это ваше общее место — {config.APP_TITLE}"

        arg = (command.args or "").strip()
        if arg.startswith("join_") and not user.couple_id:
            code = arg.removeprefix("join_").upper()
            couple = (await s.execute(select(Couple).where(Couple.code == code))).scalar_one_or_none()
            members = []
            if couple:
                members = (await s.execute(select(User).where(User.couple_id == couple.id))).scalars().all()
            if couple and len(members) < 2:
                user.couple_id = couple.id
                text += "\n\nВы связаны в пару"
                for m in members:
                    await notify(m.id, f"{name} присоединился(лась) к вашей паре!")
            else:
                text += "\n\nКод приглашения не подошёл"
        await s.commit()
    await message.answer(text, reply_markup=open_app_kb())


# ---------- ответ на настроение партнёра ----------
MOOD_REPLIES = {
    "hug": ("Обнять", "обнимает тебя"),
    "call": ("Позвоню вечером", "позвонит тебе вечером"),
    "soon": ("Скоро увидимся", "говорит: скоро увидимся"),
}


def mood_reply_rows(mood_id: int) -> list[list[InlineKeyboardButton]]:
    btns = [InlineKeyboardButton(text=t, callback_data=f"mr:{mood_id}:{k}") for k, (t, _) in MOOD_REPLIES.items()]
    return [btns[:2], btns[2:]]


async def apply_mood_reply(mood_id: int, user_id: int, kind: str) -> str | None:
    """Сохранить ответ на настроение и сообщить автору. Возвращает текст ошибки или None."""
    if kind not in MOOD_REPLIES:
        return "Неизвестный ответ"
    async with Session() as s:
        mood = await s.get(Mood, mood_id)
        user = await s.get(User, user_id)
        if not mood or not user or user.couple_id != mood.couple_id or mood.user_id == user.id:
            return "Это настроение не для тебя"
        same = mood.reaction == kind
        mood.reaction = kind
        await s.commit()
        if not same:
            from .pet import award  # локально: pet импортирует bot
            await award(s, user.couple_id, "mood_reply")
    if not same:
        await notify(mood.user_id, f"{user.name} {MOOD_REPLIES[kind][1]}", tab="mood")
    return None


@dp.callback_query(F.data.startswith("mr:"))
async def on_mood_reply(cb: CallbackQuery):
    try:
        _, mid, kind = cb.data.split(":")
        err = await apply_mood_reply(int(mid), cb.from_user.id, kind)
    except ValueError:
        err = "Не получилось"
    if err:
        return await cb.answer(err, show_alert=True)
    await cb.answer("Отправлено")
    try:
        await cb.message.edit_text(f"{cb.message.text}\n\nТы ответил(а): {MOOD_REPLIES[kind][0]}",
                                   reply_markup=open_app_kb(tab="mood"))
    except Exception:
        pass


@dp.message(F.text)
async def fallback(message: Message):
    await message.answer("Всё живёт в приложении", reply_markup=open_app_kb())


async def setup_bot() -> None:
    if not bot or not config.WEBAPP_URL:
        return
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text="Открыть", web_app=WebAppInfo(url=config.WEBAPP_URL))
    )


async def notify(user_id: int, text: str, button: str = "Открыть", tab: str | None = None,
                 rows: list[list[InlineKeyboardButton]] | None = None) -> None:
    if not bot:
        log.info("notify %s: %s", user_id, text)
        return
    kb = open_app_kb(button, tab)
    if rows:
        kb = InlineKeyboardMarkup(inline_keyboard=rows + (kb.inline_keyboard if kb else []))
    try:
        await bot.send_message(user_id, text, reply_markup=kb)
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
