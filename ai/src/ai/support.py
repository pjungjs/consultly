import json
import os
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import anthropic
import httpx
from anthropic import beta_async_tool

from .help_topics import TOPICS, reference_text
from .models import current_model, fallback_params

API_URL = os.environ.get("API_URL", "http://127.0.0.1:4000")
COOKIE = "consultly_session"
CLIENT_CANCEL_HOURS = 24  # matches the API

SYSTEM = f"""You are the support assistant on Consultly, a marketplace where clients book and pay independent consultants for one-hour sessions.

Answer questions about using Consultly, using the reference below. Be brief and friendly: two to four sentences unless the user asks for detail.
When a question is about the user's own bookings or sessions, call get_my_bookings and answer from its result; times in it are already in the user's time zone.
You can't change anything yourself. To cancel, add a brief or edit a profile, point the user to the page that does it, using paths like /my-bookings or /profile.
If the reference doesn't cover something, say so and suggest /contact. Don't make up policies, prices or dates.

# Reference
{reference_text()}"""


class SupportFailed(RuntimeError):
    """The assistant couldn't answer; the message is safe to show to the user."""


def _when(iso: str, zone: ZoneInfo) -> str:
    local = datetime.fromisoformat(iso).astimezone(zone)
    return local.strftime("%a %b %-d, %-I:%M %p %Z")


async def fetch_bookings(
    session: str, timezone: str, transport: httpx.AsyncBaseTransport | None = None
) -> dict | None:
    """The signed-in user's bookings, fetched from the NestJS API *as that user*, so it can never see more than they can.
    Returns None when the session isn't valid. `transport` lets tests answer the HTTP calls."""
    zone = ZoneInfo(timezone)
    now = datetime.now(UTC)
    async with httpx.AsyncClient(
        base_url=API_URL, cookies={COOKIE: session}, timeout=10, transport=transport
    ) as http:
        orders = await http.get("/me/orders")
        if orders.status_code == 401:
            return None
        orders.raise_for_status()
        dashboard = await http.get("/me/consultant/dashboard")

    def is_upcoming(b: dict) -> bool:
        return datetime.fromisoformat(b["endsAt"]) > now

    as_client: list[tuple[datetime, dict]] = []
    for order in orders.json()["orders"]:
        for b in order["bookings"]:
            starts = datetime.fromisoformat(b["startsAt"])
            status = (
                "booked"
                if b["status"] == "CONFIRMED"
                else "cancelled by you"
                if b.get("cancelledBy") == "CLIENT"
                else "cancelled by the consultant"
            )
            as_client.append(
                (
                    starts,
                    {
                        "with": order["consultant"]["name"],
                        "when": _when(b["startsAt"], zone),
                        "status": status,
                        "upcoming": is_upcoming(b),
                        "brief_attached": bool(order.get("brief")),
                        "can_cancel_online": status == "booked"
                        and (starts - now).total_seconds() > CLIENT_CANCEL_HOURS * 3600,
                    },
                )
            )
    # Upcoming first, soonest first; then past, most recent first.
    upcoming = sorted(
        (pair for pair in as_client if pair[1]["upcoming"]), key=lambda pair: pair[0]
    )
    past = sorted(
        (pair for pair in as_client if not pair[1]["upcoming"]),
        key=lambda pair: pair[0],
        reverse=True,
    )
    result: dict = {"timezone": timezone, "as_client": [s for _, s in upcoming + past]}
    if dashboard.status_code == 200:  # also a consultant
        result["as_consultant_upcoming"] = [
            {
                "client": s["order"]["clientName"],
                "when": _when(s["startsAt"], zone),
                "brief_attached": bool(s["order"].get("brief")),
            }
            for s in dashboard.json()["upcoming"]
        ]
    return result


# --- Demo mode: no API key, so answer from the help topics by keyword ----------------------------------

BOOKING_QUESTIONS = (
    "my booking",
    "my session",
    "my next",
    "upcoming",
    "when is",
    "when's",
    "do i have",
    "booked with",
    "my schedule",
    "my appointment",
)


def _bookings_text(data: dict) -> str:
    upcoming = [
        s for s in data["as_client"] if s["upcoming"] and s["status"] == "booked"
    ]
    lines = [
        f"- {s['when']} with {s['with']}"
        + (" (brief attached)" if s["brief_attached"] else "")
        for s in upcoming
    ]
    text = (
        "Your upcoming sessions:\n" + "\n".join(lines)
        if lines
        else "You have no upcoming sessions as a client."
    )
    if "as_consultant_upcoming" in data:
        hosting = [
            f"- {s['when']} with {s['client']}" for s in data["as_consultant_upcoming"]
        ]
        text += "\n\nSessions you're hosting:\n" + (
            "\n".join(hosting) if hosting else "None coming up."
        )
    return text + "\n\nManage them in /my-bookings."


async def demo_reply(question: str, session: str | None, timezone: str) -> str:
    q = question.lower()
    if any(phrase in q for phrase in BOOKING_QUESTIONS):
        data = await fetch_bookings(session, timezone) if session else None
        return (
            _bookings_text(data)
            if data
            else "Sign in on /my-bookings and I can list your sessions here."
        )
    scored = sorted(
        ((sum(k in q for k in t.keywords), t) for t in TOPICS),
        key=lambda pair: -pair[0],
    )
    best_score, best = scored[0]
    if best_score == 0:
        topics = ", ".join(t.title.lower() for t in TOPICS[:8])
        return f"I can help with {topics}, or your own bookings. Try asking about one of those, or use /contact."
    return best.answer


# --- With a key: Claude, with one read-only tool -------------------------------------------------------


async def claude_reply(
    client: anthropic.AsyncAnthropic,
    messages: list[dict],
    session: str | None,
    timezone: str,
) -> tuple[str, str]:
    """Returns the reply and the model that actually answered."""

    # Defined per request so the tool is bound to this user's session and nobody else's.
    @beta_async_tool
    async def get_my_bookings() -> str:
        """Get the signed-in user's bookings: sessions they booked as a client (upcoming first) and, if they are also a
        consultant, the sessions they are hosting. Times are already in the user's time zone. Read-only."""
        if not session:
            return "The user isn't signed in. Tell them to sign in at /my-bookings to see their bookings."
        try:
            data = await fetch_bookings(session, timezone)
        except httpx.HTTPError:
            return "Bookings couldn't be loaded right now. Suggest checking /my-bookings directly."
        return (
            json.dumps(data)
            if data
            else "The user's sign-in has expired. Tell them to sign in again at /my-bookings."
        )

    model = current_model()
    try:
        runner = client.beta.messages.tool_runner(
            model=model,
            max_tokens=16000,
            system=SYSTEM,
            messages=messages,
            tools=[get_my_bookings],
            max_iterations=4,  # one lookup and an answer is the normal case; this caps a runaway loop
            output_config={
                "effort": "low"
            },  # short support answers; low effort keeps replies quick and cheap
            **fallback_params(model),
        )
        final = await runner.until_done()
    except anthropic.RateLimitError as err:
        raise SupportFailed(
            "The assistant is busy right now. Try again in a minute."
        ) from err
    except anthropic.APIStatusError as err:
        raise SupportFailed(
            f"The assistant hit an error ({err.status_code}). Try again, or use /contact."
        ) from err
    except anthropic.APIConnectionError as err:
        raise SupportFailed(
            "The assistant couldn't be reached. Try again in a moment."
        ) from err

    if final.stop_reason == "refusal":
        return (
            "I can't help with that one. For anything about your bookings, try /my-bookings or /contact.",
            final.model,
        )
    text = "\n".join(b.text for b in final.content if b.type == "text").strip()
    return (
        text
        or "Sorry, I couldn't put an answer together. Try rephrasing, or use /contact.",
        final.model,
    )
