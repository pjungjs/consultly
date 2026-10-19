import hmac
import logging
import os
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import anthropic
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Form, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from .help_topics import TOPICS
from .models import current_model
from .pdf import InvalidPdf, extract_text
from .prep_sheet import PrepSheet, SummaryFailed, write_prep_sheet
from .support import SupportFailed, claude_reply, demo_reply

load_dotenv()  # ai/.env: ANTHROPIC_API_KEY (optional: without it, briefs are read but not summarised)
log = logging.getLogger("ai")

MAX_BYTES = 10 * 1024 * 1024


def require_service_token(
    request: Request, x_service_token: str | None = Header(default=None)
) -> None:
    """Once deployed, only the NestJS API may call this service: it must send AI_SERVICE_TOKEN.
    Unset locally (the service is bound to 127.0.0.1). /health stays open for the host's health checks."""
    expected = os.environ.get("AI_SERVICE_TOKEN")
    if request.url.path == "/health":
        return
    if expected and not hmac.compare_digest(x_service_token or "", expected):
        raise HTTPException(401, "Unauthorized")


app = FastAPI(title="Consultly AI", dependencies=[Depends(require_service_token)])


class SummaryResult(BaseModel):
    """READY: summary written. NO_TEXT: nothing to read (scanned PDF). UNAVAILABLE: no API key (demo mode). FAILED: Claude errored."""

    status: Literal["READY", "NO_TEXT", "UNAVAILABLE", "FAILED"]
    pages: int
    characters: int
    summary: PrepSheet | None = None
    model: str | None = None
    message: str | None = None


def claude_client() -> anthropic.AsyncAnthropic | None:
    # Demo mode: with no key configured the service still reads PDFs, it just doesn't call Claude.
    return anthropic.AsyncAnthropic() if os.environ.get("ANTHROPIC_API_KEY") else None


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "ai": bool(os.environ.get("ANTHROPIC_API_KEY")),
        "model": current_model(),
    }


@app.post("/briefs/summarize")
async def summarize(
    file: UploadFile,
    allow_ai: bool = Form(True),
    session_minutes: int = Form(60, ge=15, le=120),
) -> SummaryResult:
    """`allow_ai=false` (sent by the API once the daily AI cap is used up) reads the PDF but doesn't call Claude."""
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "Briefs can be at most 10 MB.")
    if not data.startswith(b"%PDF"):
        raise HTTPException(415, "Upload a PDF file.")
    try:
        pdf = extract_text(data)
    except InvalidPdf as err:
        raise HTTPException(422, str(err)) from err

    base = {"pages": pdf.pages, "characters": len(pdf.text)}
    if not pdf.text:
        return SummaryResult(
            status="NO_TEXT",
            message="This PDF has no readable text (it may be a scan). Upload a text-based PDF.",
            **base,
        )

    if not allow_ai:
        return SummaryResult(
            status="UNAVAILABLE",
            message="Today's limit for AI summaries has been reached, so there's no prep sheet yet. Upload the PDF again tomorrow; your consultant can still open the original.",
            **base,
        )
    client = claude_client()
    if client is None:
        return SummaryResult(
            status="UNAVAILABLE",
            message="AI summaries are switched off right now, so there's no prep sheet yet. Your consultant can still open the original PDF.",
            **base,
        )
    try:
        sheet, model = await write_prep_sheet(client, pdf.text, session_minutes)
    except SummaryFailed as err:
        log.error("summary failed: %s", err.__cause__ or err)
        return SummaryResult(status="FAILED", message=str(err), **base)
    return SummaryResult(status="READY", summary=sheet, model=model, **base)


@app.get("/support/topics")
def support_topics() -> list[dict]:
    """The help topics, for the FAQ page: the same text the Help assistant answers from."""
    return [{"title": t.title, "answer": t.answer} for t in TOPICS]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)
    session: str | None = (
        None  # the user's sign-in session, forwarded by NestJS; used only to look up their bookings
    )
    timezone: str = "UTC"
    # The Help panel's Live AI / Demo switch. Demo never calls Claude, so it costs nothing.
    mode: Literal["ai", "demo"] = "demo"


class ChatReply(BaseModel):
    reply: str
    mode: Literal["ai", "demo"]  # what actually answered
    model: str | None = None  # the Claude model, when mode is "ai"
    notice: str | None = None  # e.g. why Live AI fell back to demo


@app.post("/support/chat")
async def support_chat(req: ChatRequest) -> ChatReply:
    if req.messages[-1].role != "user":
        raise HTTPException(422, "The last message must be from the user.")
    try:
        ZoneInfo(req.timezone)
        timezone = req.timezone
    except (ZoneInfoNotFoundError, ValueError):
        timezone = "UTC"

    client = claude_client() if req.mode == "ai" else None
    if (
        client is None
    ):  # demo: chosen in the panel, no key configured, or the API's daily cap is used up
        notice = (
            "Live AI isn't available (no API key configured), so this is a demo answer."
            if req.mode == "ai"
            else None
        )
        return ChatReply(
            reply=await demo_reply(req.messages[-1].content, req.session, timezone),
            mode="demo",
            notice=notice,
        )
    try:
        reply, model = await claude_reply(
            client, [m.model_dump() for m in req.messages], req.session, timezone
        )
    except SupportFailed as err:
        log.error(
            "support chat failed: %s", err.__cause__ or err
        )  # never log the session
        return ChatReply(reply=str(err), mode="ai")
    return ChatReply(reply=reply, mode="ai", model=model)
