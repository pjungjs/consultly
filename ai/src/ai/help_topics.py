"""What Consultly's support assistant knows. One list, used both as Claude's reference and for demo-mode keyword answers.
Keep it in sync with how the site actually behaves (and with the How it works page)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Topic:
    title: str
    keywords: tuple[str, ...]
    answer: str


TOPICS: tuple[Topic, ...] = (
    Topic(
        "Booking a session",
        (
            "book",
            "booking",
            "reserve",
            "schedule",
            "slot",
            "how does",
            "pay",
            "checkout",
            "several",
            "multiple",
        ),
        "Open a consultant's profile from /consultants, pick one or more times (up to 6 at once), then pay once on Stripe. "
        "Your times are held for 30 minutes while you pay. You get a confirmation email, and every booking is in /my-bookings.",
    ),
    Topic(
        "Cancelling as a client",
        (
            "cancel",
            "cancellation",
            "can't make",
            "cannot make",
            "reschedule",
            "change my booking",
        ),
        "In /my-bookings, any session that starts more than 24 hours from now has a Cancel button: you get a full refund for that session "
        "and the consultant is told. Inside 24 hours it can't be cancelled online; contact your consultant. Rescheduling isn't built in yet: "
        "cancel (if more than 24 hours away) and book a new time.",
    ),
    Topic(
        "Refunds",
        ("refund", "money back", "charged", "charge", "card"),
        "Refunds go back to the card you paid with and usually appear within 5-10 business days. "
        "You're refunded in full when you cancel more than 24 hours ahead, or whenever the consultant cancels.",
    ),
    Topic(
        "When a consultant cancels",
        (
            "consultant cancelled",
            "consultant canceled",
            "they cancelled",
            "they canceled",
            "no-show",
        ),
        "If a consultant cancels a session, you're refunded in full for that session automatically and get an email. The time opens up again.",
    ),
    Topic(
        "Time zones",
        ("time zone", "timezone", "what time", "local time", "daylight"),
        "Every time on the site is shown in your own time zone; the consultant's local time is shown in grey next to it. "
        "You can set the time zone used in your emails on /profile.",
    ),
    Topic(
        "Briefs for your consultant",
        ("brief", "pdf", "upload", "document", "summary", "prep", "attach"),
        "On a booking's page (open it from /my-bookings), you can attach a PDF brief: up to 10 MB and 30 pages. "
        "It's turned into a one-page prep sheet your consultant reads before the session, and you see the same sheet. "
        "You can replace or remove it until the session starts.",
    ),
    Topic(
        "Signing in",
        (
            "sign in",
            "log in",
            "login",
            "password",
            "link",
            "email didn't",
            "no email",
            "account",
        ),
        "There are no passwords: enter your email on /my-bookings and we send a sign-in link. It works once and expires in 15 minutes. "
        "If it doesn't arrive, check spam and ask for a new link.",
    ),
    Topic(
        "Becoming a consultant",
        (
            "become a consultant",
            "offer",
            "consultant profile",
            "sell",
            "my hours",
            "availability",
            "pause",
            "listed",
        ),
        "On /profile, choose Become a consultant and fill in your public profile. It stays hidden from clients until you set weekly hours "
        "in the dashboard's Availability tab (/dashboard). You can pause it at any time; existing bookings are kept.",
    ),
    Topic(
        "How far ahead you can book",
        ("how far", "next month", "advance", "ahead", "60 days", "weeks"),
        "You can book up to 60 days ahead. On a consultant's profile, switch between Week and Month views; Today jumps back to now.",
    ),
    Topic(
        "Payments and security",
        ("secure", "safe", "stripe", "payment details", "test mode"),
        "Payments are handled by Stripe; Consultly never sees your full card number. This demo runs in Stripe test mode, so no real money moves.",
    ),
    Topic(
        "Talking to a person",
        ("human", "person", "support team", "contact", "complaint", "help me"),
        "For anything the assistant can't sort out, use the Contact page: /contact.",
    ),
)


def reference_text() -> str:
    """The topics as plain text for Claude's system prompt."""
    return "\n\n".join(f"## {t.title}\n{t.answer}" for t in TOPICS)
