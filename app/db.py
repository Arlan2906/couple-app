from datetime import date, datetime

from sqlalchemy import (BigInteger, Boolean, Date, DateTime, ForeignKey, Integer,
                        String, Text, UniqueConstraint, func)
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import BASE_DIR, DATABASE_URL, DB_SSL

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


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session():
    async with Session() as s:
        yield s


__all__ = ["AsyncSession", "Session", "init_db", "get_session", "Couple", "User", "Moment",
           "Wish", "Mood", "Goal", "Deposit", "BucketItem"]
