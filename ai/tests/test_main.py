from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from ai import main
from ai.prep_sheet import AgendaItem, PrepSheet, SummaryFailed
from scripts.make_sample_pdfs import build_pdf

SAMPLE = (
    Path(__file__).resolve().parents[2]
    / "api"
    / "prisma"
    / "samples"
    / "ecoway-architecture-brief.pdf"
).read_bytes()
client = TestClient(main.app)


def upload(data: bytes):
    return client.post(
        "/briefs/summarize", files={"file": ("brief.pdf", data, "application/pdf")}
    )


@pytest.fixture
def with_key(monkeypatch):
    """Pretends a key is configured; the Claude call itself is replaced per test, so nothing leaves the machine."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")


def test_demo_mode_reads_the_pdf_but_writes_no_summary(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    body = upload(SAMPLE).json()
    assert body["status"] == "UNAVAILABLE"
    assert body["characters"] > 1000 and body["summary"] is None


def test_returns_the_prep_sheet_when_claude_answers(with_key, monkeypatch):
    sheet = PrepSheet(
        one_liner="Fix double bookings",
        background="EV charging marketplace.",
        goals=["Ship a fix"],
        key_facts=["0.3% double-booked"],
        questions=["Locks or constraints?"],
        gaps=["Peak load"],
        agenda=[AgendaItem(minutes=60, topic="Booking flow")],
    )

    async def fake_write(_client, text):
        assert (
            "double-booked" in text
        )  # Claude gets the extracted text, not the raw PDF
        return sheet, "claude-haiku-5-5"

    monkeypatch.setattr(main, "write_prep_sheet", fake_write)
    body = upload(SAMPLE).json()
    assert body["status"] == "READY"
    assert body["summary"]["one_liner"] == "Fix double bookings"
    assert body["model"] == "claude-haiku-5-5"  # the model that actually answered


def test_reports_a_failed_summary_without_erroring(with_key, monkeypatch):
    async def fake_write(_client, _text):
        raise SummaryFailed("The AI service is busy. Try uploading again in a minute.")

    monkeypatch.setattr(main, "write_prep_sheet", fake_write)
    res = upload(SAMPLE)
    assert res.status_code == 200
    assert res.json() == {
        **res.json(),
        "status": "FAILED",
        "message": "The AI service is busy. Try uploading again in a minute.",
    }


def test_a_pdf_with_no_text_layer_is_not_sent_to_claude(with_key, monkeypatch):
    async def must_not_run(*_):
        raise AssertionError("Claude should not be called for an empty PDF")

    monkeypatch.setattr(main, "write_prep_sheet", must_not_run)
    assert upload(build_pdf("")).json()["status"] == "NO_TEXT"


def test_rejects_non_pdfs_and_oversized_files():
    assert upload(b"hello").status_code == 415
    assert upload(b"%PDF" + b"0" * (10 * 1024 * 1024)).status_code == 413
