import logging
from datetime import date, datetime

from sqlalchemy import (BigInteger, Boolean, Date, DateTime, Float, ForeignKey, Integer,
                        String, Text, UniqueConstraint, func, inspect, text)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import BASE_DIR, DATABASE_URL, DB_SSL

log = logging.getLogger("db")

if DATABASE_URL.startswith("sqlite"):
    (BASE_DIR / "data").mkdir(exist_ok=True)
    engine = create_async_engine(DATABASE_URL, echo=False)
else:
    # pool_pre_ping: Neon засыпает и рвёт соединения — проверяем перед использованием
    engine = create_async_engine(DATABASE_URL, echo=False, pool_pre_ping=True, pool_recycle=240,
                                 connect_args={"ssl": True} if DB_SSL else {})
Session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Couple(Base):
    __tablename__ = "couples"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    started_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    started_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "HH:MM" по Алматы
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)  # Telegram user id
    name: Mapped[str] = mapped_column(String(128))
    couple_id: Mapped[int | None] = mapped_column(ForeignKey("couples.id"), nullable=True)


class Moment(Base):
    """Таймлайн «Мы»"""
    __tablename__ = "moments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    couple_id: Mapped[int] = mapped_column(ForeignKey("couples.id"), index=True)
    author_id: Mapped[int] = mapped_column(BigInteger)
    title: Mapped[str] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text, default="")
    happened_on: Mapped[date] = mapped_column(Date)
    photo_file_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    scene: Mapped[str | None] = mapped_column(String(16), nullable=True)  # сцена в мультике: walk | movie | …


class Wish(Base):
    __tablename__ = "wishes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    couple_id: Mapped[int] = mapped_column(ForeignKey("couples.id"), index=True)
    owner_id: Mapped[int] = mapped_column(BigInteger)
    title: Mapped[str] = mapped_column(String(200))
    link: Mapped[str] = mapped_column(String(500), default="")
    price: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reserved_by: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    received: Mapped[bool] = mapped_column(Boolean, default=False)


class Mood(Base):
    __tablename__ = "moods"
    __table_args__ = (UniqueConstraint("user_id", "day"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    couple_id: Mapped[int] = mapped_column(ForeignKey("couples.id"), index=True)
    user_id: Mapped[int] = mapped_column(BigInteger)
    day: Mapped[date] = mapped_column(Date)
    emoji: Mapped[str] = mapped_column(String(16))
    note: Mapped[str] = mapped_column(String(300), default="")
    reaction: Mapped[str | None] = mapped_column(String(16), nullable=True)  # ответ партнёра: hug | call | soon


class Goal(Base):
    """Копилка"""
    __tablename__ = "goals"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    couple_id: Mapped[int] = mapped_column(ForeignKey("couples.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    emoji: Mapped[str] = mapped_column(String(16), default="💰")
    target: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Deposit(Base):
    __tablename__ = "deposits"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("goals.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(BigInteger)
    amount: Mapped[int] = mapped_column(Integer)  # может быть отрицательным — «сняли»
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class BucketItem(Base):
    __tablename__ = "bucket_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    couple_id: Mapped[int] = mapped_column(ForeignKey("couples.id"), index=True)
    author_id: Mapped[int] = mapped_column(BigInteger)
    title: Mapped[str] = mapped_column(String(200))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    photo_file_id: Mapped[str | None] = mapped_column(String(256), nullable=True)


class Pet(Base):
    """Общий питомец пары (тамагочи)"""
    __tablename__ = "pets"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    couple_id: Mapped[int] = mapped_column(ForeignKey("couples.id"), unique=True, index=True)
    kind: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(40))
    food: Mapped[float] = mapped_column(Float, default=80)   # сытость 0..100
    joy: Mapped[float] = mapped_column(Float, default=80)    # радость 0..100
    xp: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime)   # когда последний раз пересчитывали убывание (UTC)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class PetAction(Base):
    """Кто когда кормил/гладил — для перезарядки кнопок и ленты"""
    __tablename__ = "pet_actions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(BigInteger)
    action: Mapped[str] = mapped_column(String(24))
    at: Mapped[datetime] = mapped_column(DateTime)


class Note(Base):
    """«Несказанное» — личные записки партнёру"""
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    couple_id: Mapped[int] = mapped_column(ForeignKey("couples.id"), index=True)
    author_id: Mapped[int] = mapped_column(BigInteger)
    recipient_id: Mapped[int] = mapped_column(BigInteger, index=True)
    kind: Mapped[str] = mapped_column(String(16))          # thanks | worry | talk | other
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reaction: Mapped[str | None] = mapped_column(String(16), nullable=True)  # hug | talk | thanks | kiss | handshake


class PetUnlock(Base):
    """Что уже открыто в доме питомца (чтобы сообщать только о новом)"""
    __tablename__ = "pet_unlocks"
    __table_args__ = (UniqueConstraint("pet_id", "item_id"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pet_id: Mapped[int] = mapped_column(ForeignKey("pets.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[str] = mapped_column(String(32))
    created_at: Mapped[datetime | None] = mapped_column(DateTime, server_default=func.now(), nullable=True)


class SentLog(Base):
    """Какие рассылки уже ушли (защита от повторного запуска cron)"""
    __tablename__ = "sent_log"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


def _literal(value, dialect: str) -> str | None:
    if isinstance(value, bool):
        return ("TRUE" if value else "FALSE") if dialect == "postgresql" else ("1" if value else "0")
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return None


def _add_missing_columns(conn) -> None:
    """create_all не меняет уже существующие таблицы. Когда в модели появляется новое поле,
    добавляем колонку сами — без ручного ALTER TABLE в консоли Neon."""
    insp = inspect(conn)
    dialect = conn.dialect.name
    for table in Base.metadata.sorted_tables:
        if not insp.has_table(table.name):
            continue
        have = {c["name"] for c in insp.get_columns(table.name)}
        for col in table.columns:
            if col.name in have:
                continue
            ddl = f'ALTER TABLE {table.name} ADD COLUMN {col.name} {col.type.compile(dialect=conn.dialect)}'
            if col.default is not None and getattr(col.default, "is_scalar", False):
                lit = _literal(col.default.arg, dialect)
                if lit is not None:
                    ddl += f" DEFAULT {lit}"
            elif col.server_default is not None and dialect == "postgresql":
                ddl += " DEFAULT CURRENT_TIMESTAMP"  # в SQLite нельзя добавить колонку с таким умолчанием
            conn.execute(text(ddl))
            log.info("Миграция: %s", ddl)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_add_missing_columns)


async def get_session():
    async with Session() as s:
        yield s


__all__ = ["AsyncSession", "Session", "init_db", "get_session", "Couple", "User", "Moment",
           "Wish", "Mood", "Goal", "Deposit", "BucketItem", "SentLog", "Pet", "PetAction", "Note", "PetUnlock"]
