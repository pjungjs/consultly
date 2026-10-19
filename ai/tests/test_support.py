import json
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import httpx
import pytest
from fastapi.testclient import TestClient

from ai import main, support
from ai.support import SupportFailed, claude_reply, demo_reply, fetch_bookings

client = TestClient(main.app)
NOW = datetime.now(UTC)


def iso(delta: timedelta) -> str:
    return (NOW + delta).isoformat().replace("+00:00", "Z")


def booking(delta: timedelta, status="CONFIRMED", cancelled_by=None):
    return {
        "startsAt": iso(delta),
        "endsAt": iso(delta + timedelta(hours=1)),
        "status": status,
        "cancelledBy": cancelled_by,
    }


ORDERS = {
    "orders": [
        {
            "consultant": {"name": "Kenji"},
            "brief": {"status": "READY"},
            "bookings": [booking(timedelta(days=5))],
        },
        {
            "consultant": {"name": "Sora"},
            "brief": None,
            "bookings": [booking(timedelta(hours=3)), booking(-timedelta(days=2))],
        },
        {
            "consultant": {"name": "Amara"},
            "brief": None,
            "bookings": [booking(timedelta(days=1), "CANCELLED", "CLIENT")],
        },
    ]
}


def api(dashboard_status=403, signed_in=True):
    """Fake NestJS API; records the cookie it was called with."""
    seen = {}

    def handler(request: httpx.Request):
        seen["cookie"] = request.headers.get("cookie")
        if not signed_in:
            return httpx.Response(401, json={})
        if request.url.path == "/me/orders":
            return httpx.Response(200, json=ORDERS)
        upcoming = [
            {
                "startsAt": iso(timedelta(days=2)),
                "order": {"clientName": "EcoWay", "brief": {"status": "READY"}},
            }
        ]
        return httpx.Response(dashboard_status, json={"upcoming": upcoming})

    return httpx.MockTransport(handler), seen


# --- fetch_bookings ---------------------------------------------------------------------------------


async def test_fetches_as_the_user_and_orders_soonest_first():
    transport, seen = api()
    data = await fetch_bookings("sid-123", "Asia/Tokyo", transport)
    assert seen["cookie"] == "consultly_session=sid-123"
    names = [(s["with"], s["upcoming"]) for s in data["as_client"]]
    assert names == [
        ("Sora", True),
        ("Amara", True),
        ("Kenji", True),
        ("Sora", False),
    ]  # upcoming by time, then past
    assert data["as_client"][0]["when"].endswith(
        "JST"
    )  # formatted in the user's zone, not left to the model


async def test_marks_what_can_still_be_cancelled_online():
    transport, _ = api()
    by_name = {
        s["with"]: s
        for s in (await fetch_bookings("sid", "UTC", transport))["as_client"]
        if s["upcoming"]
    }
    assert by_name["Kenji"]["can_cancel_online"] is True  # 5 days away
    assert by_name["Sora"]["can_cancel_online"] is False  # 3 hours away
    assert by_name["Amara"] == {
        **by_name["Amara"],
        "status": "cancelled by you",
        "can_cancel_online": False,
    }
    assert by_name["Kenji"]["brief_attached"] is True


async def test_adds_hosted_sessions_only_for_consultants():
    transport, _ = api(dashboard_status=403)
    assert "as_consultant_upcoming" not in await fetch_bookings("sid", "UTC", transport)
    transport, _ = api(dashboard_status=200)
    assert (await fetch_bookings("sid", "UTC", transport))["as_consultant_upcoming"][0][
        "client"
    ] == "EcoWay"


async def test_an_expired_session_gets_nothing():
    transport, _ = api(signed_in=False)
    assert await fetch_bookings("old", "UTC", transport) is None


# --- demo mode --------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("question", "expected"),
    [
        ("how do i book a session?", "pay once on Stripe"),
        ("Can I get my money back?", "5-10 business days"),
        ("what's the weather?", "I can help with"),
    ],
)
async def test_demo_answers_by_keyword(question, expected):
    assert expected in await demo_reply(question, None, "UTC")


async def test_demo_booking_questions_need_sign_in():
    assert "Sign in" in await demo_reply("when is my next session?", None, "UTC")


async def test_demo_lists_real_bookings_when_signed_in(monkeypatch):
    transport, _ = api()

    async def fake_fetch(session, timezone):
        return await fetch_bookings(session, timezone, transport)

    monkeypatch.setattr(support, "fetch_bookings", fake_fetch)
    reply = await demo_reply("When is my next session?", "sid", "UTC")
    assert reply.index("Sora") < reply.index("Kenji")  # soonest first
    assert "Amara" not in reply  # cancelled sessions aren't "upcoming sessions"
    assert "(brief attached)" in reply


# --- with Claude ------------------------------------------------------------------------------------


class FakeClaude:
    """Stands in for AsyncAnthropic: captures what the tool runner was given and returns a canned final message."""

    def __init__(self, final=None, error=None):
        self.kwargs = None
        runner = SimpleNamespace(until_done=self._done)
        self.beta = SimpleNamespace(
            messages=SimpleNamespace(
                tool_runner=lambda **kw: (setattr(self, "kwargs", kw), runner)[1]
            )
        )
        self.final, self.error = final, error

    async def _done(self):
        if self.error:
            raise self.error
        return self.final


def message(text, stop_reason="end_turn", model="claude-haiku-5-5"):
    return SimpleNamespace(
        stop_reason=stop_reason,
        model=model,
        content=[SimpleNamespace(type="text", text=text)],
    )


async def test_claude_gets_the_help_reference_and_one_read_only_tool():
    fake = FakeClaude(final=message("Refunds take 5-10 business days."))
    reply = await claude_reply(
        fake, [{"role": "user", "content": "refunds?"}], None, "UTC"
    )
    assert reply == ("Refunds take 5-10 business days.", "claude-haiku-5-5")
    assert "Cancelling as a client" in fake.kwargs["system"]
    assert [t.name for t in fake.kwargs["tools"]] == ["get_my_bookings"]
    assert fake.kwargs["max_iterations"] == 4


async def test_the_tool_is_bound_to_this_users_session(monkeypatch):
    calls = []

    async def fake_fetch(session, timezone):
        calls.append((session, timezone))
        return {"as_client": []}

    monkeypatch.setattr(support, "fetch_bookings", fake_fetch)
    signed_in = FakeClaude(final=message("ok"))
    await claude_reply(
        signed_in,
        [{"role": "user", "content": "my sessions?"}],
        "sid-A",
        "Europe/Paris",
    )
    assert json.loads(await signed_in.kwargs["tools"][0].func()) == {"as_client": []}
    assert calls == [("sid-A", "Europe/Paris")]

    signed_out = FakeClaude(final=message("ok"))
    await claude_reply(
        signed_out, [{"role": "user", "content": "my sessions?"}], None, "UTC"
    )
    assert "isn't signed in" in await signed_out.kwargs["tools"][0].func()


async def test_refusals_and_api_errors_become_friendly_replies():
    reply, _ = await claude_reply(
        FakeClaude(final=message("", "refusal")),
        [{"role": "user", "content": "x"}],
        None,
        "UTC",
    )
    assert "can't help" in reply
    import anthropic

    error = anthropic.APIConnectionError(
        request=httpx.Request("POST", "https://api.anthropic.com")
    )
    with pytest.raises(SupportFailed, match="couldn't be reached"):
        await claude_reply(
            FakeClaude(error=error), [{"role": "user", "content": "x"}], None, "UTC"
        )


# --- endpoint ---------------------------------------------------------------------------------------


def chat(**body):
    return client.post(
        "/support/chat",
        json={
            "messages": [{"role": "user", "content": "how do refunds work?"}],
            **body,
        },
    )


def test_endpoint_uses_demo_mode_without_a_key(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    body = chat(
        timezone="Not/AZone"
    ).json()  # a bad zone falls back to UTC instead of failing
    assert body["mode"] == "demo" and "business days" in body["reply"]


def test_live_ai_uses_claude_when_a_key_is_set(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    async def fake_reply(_client, messages, session, timezone):
        return f"{len(messages)} message(s), session={session}", "claude-haiku-5-5"

    monkeypatch.setattr(main, "claude_reply", fake_reply)
    body = chat(session="sid", mode="ai").json()
    assert body == {
        "reply": "1 message(s), session=sid",
        "mode": "ai",
        "model": "claude-haiku-5-5",
        "notice": None,
    }


def test_demo_never_calls_claude_even_with_a_key(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    async def must_not_run(*_):
        raise AssertionError("Demo mode must not call Claude")

    monkeypatch.setattr(main, "claude_reply", must_not_run)
    assert chat(mode="demo").json()["mode"] == "demo"
    assert chat().json()["mode"] == "demo"  # demo is the default


def test_live_ai_without_a_key_says_so_and_answers_in_demo(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    body = chat(mode="ai").json()
    assert body["mode"] == "demo" and "no API key" in body["notice"]


def test_endpoint_turns_failures_into_a_reply(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")

    async def failing(*_):
        raise SupportFailed("The assistant is busy right now. Try again in a minute.")

    monkeypatch.setattr(main, "claude_reply", failing)
    assert chat(mode="ai").json()["reply"].startswith("The assistant is busy")


def test_endpoint_validates_the_conversation():
    assert client.post("/support/chat", json={"messages": []}).status_code == 422
    assert (
        client.post(
            "/support/chat", json={"messages": [{"role": "assistant", "content": "hi"}]}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/support/chat",
            json={"messages": [{"role": "user", "content": "x" * 2001}]},
        ).status_code
        == 422
    )


def test_live_chat_sends_only_recent_messages_starting_with_the_user():
    history = [
        {"role": "user" if i % 2 == 0 else "assistant", "content": str(i)}
        for i in range(15)
    ]
    sent = support.recent(history)
    assert len(sent) <= 10 and sent[0]["role"] == "user" and sent[-1]["content"] == "14"
