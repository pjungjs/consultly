from pathlib import Path

import pytest

from ai.pdf import InvalidPdf, extract_text
from scripts.make_sample_pdfs import build_pdf

SAMPLES = Path(__file__).resolve().parents[2] / "api" / "prisma" / "samples"


def test_reads_the_text_of_a_sample_brief():
    pdf = extract_text((SAMPLES / "fernleaf-runway-brief.pdf").read_bytes())
    assert pdf.pages == 1
    assert "Series A" in pdf.text and "$420k" in pdf.text


def test_refuses_more_than_30_pages_instead_of_dropping_some():
    long_text = "\n".join(
        f"Line {i}" for i in range(46 * 31)
    )  # 46 lines per page -> 31 pages
    with pytest.raises(InvalidPdf, match="31 pages"):
        extract_text(build_pdf(long_text))


def test_rejects_bytes_that_are_not_a_readable_pdf():
    with pytest.raises(InvalidPdf):
        extract_text(b"%PDF-1.4 not really a pdf")
