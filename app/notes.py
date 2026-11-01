"""«Несказанное» — то, что сложно сказать вслух.

Записку видят только автор и получатель. В уведомлении текст не показывается
(превью Telegram видно на экране блокировки) — только что записка пришла.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select

from .auth import paired_user
from .bot import notify
from .db import AsyncSession, Note, User, get_session
from .pet import award, utcnow

router = APIRouter(prefix="/api/notes")

KINDS = {"thanks": "Благодарность", "worry": "Переживание", "talk": "Хочу обсудить", "other": "Просто так"}
REACTIONS = {
    "hug": "прочитал(а) и обнимает тебя",
    "talk": "готов(а) поговорить об этом",
    "thanks": "говорит спасибо, что ты поделился(лась)",
}


async def partner(s: AsyncSession, user: User) -> User:
    p = (await s.execute(select(User).where(User.couple_id == user.couple_id, User.id != user.id))).scalar_one_or_none()
    if not p:
        raise HTTPException(409, "Нет партнёра")
    return p


async def unread_count(s: AsyncSession, user: User) -> int:
    q = select(func.count()).select_from(Note).where(Note.recipient_id == user.id, Note.read_at.is_(None))
    return (await s.execute(q)).scalar() or 0


def out(n: Note, me: User) -> dict:
    inbox = n.recipient_id == me.id
    sealed = inbox and n.read_at is None
    return {
        "id": n.id, "kind": n.kind, "kind_name": KINDS.get(n.kind, ""),
        "text": None if sealed else n.text,       # непрочитанное не отдаём, пока не откроют
        "created_at": n.created_at.isoformat(), "read": n.read_at is not None,
        "reaction": n.reaction, "inbox": inbox,
    }


@router.get("")
async def notes_list(user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    q = select(Note).where(or_(Note.author_id == user.id, Note.recipient_id == user.id)).order_by(Note.id.desc())
    rows = (await s.execute(q)).scalars().all()
    return {
        "inbox": [out(n, user) for n in rows if n.recipient_id == user.id],
        "sent": [out(n, user) for n in rows if n.author_id == user.id],
        "kinds": KINDS,
    }


class NoteIn(BaseModel):
    kind: str
    text: str = Field(min_length=1, max_length=4000)


@router.post("")
async def notes_create(body: NoteIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    if body.kind not in KINDS:
        raise HTTPException(400, "Неизвестный тип")
    p = await partner(s, user)
    n = Note(couple_id=user.couple_id, author_id=user.id, recipient_id=p.id, kind=body.kind,
             text=body.text.strip(), created_at=utcnow())
    s.add(n)
    await s.commit()
    await award(s, user.couple_id, "note")
    await notify(p.id, f"{user.name} оставил(а) тебе записку. Открой, когда будет спокойная минута.",
                 button="Прочитать", tab="notes")
    return {"id": n.id}


async def get_inbox_note(s: AsyncSession, nid: int, user: User) -> Note:
    n = await s.get(Note, nid)
    if not n or n.recipient_id != user.id:
        raise HTTPException(404)
    return n


@router.post("/{nid}/read")
async def notes_read(nid: int, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    n = await get_inbox_note(s, nid, user)
    if n.read_at is None:
        n.read_at = utcnow()
        await s.commit()
        await notify(n.author_id, f"{user.name} прочитал(а) твою записку", tab="notes")
    return out(n, user)


class ReactIn(BaseModel):
    reaction: str


@router.post("/{nid}/react")
async def notes_react(nid: int, body: ReactIn, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    if body.reaction not in REACTIONS:
        raise HTTPException(400)
    n = await get_inbox_note(s, nid, user)
    n.read_at = n.read_at or utcnow()
    n.reaction = body.reaction
    await s.commit()
    await notify(n.author_id, f"{user.name} {REACTIONS[body.reaction]}", tab="notes")
    return out(n, user)


@router.delete("/{nid}")
async def notes_delete(nid: int, user: User = Depends(paired_user), s: AsyncSession = Depends(get_session)):
    n = await s.get(Note, nid)
    if not n or n.author_id != user.id:
        raise HTTPException(404)
    await s.delete(n)
    await s.commit()
    return {"ok": True}
