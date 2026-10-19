from dataclasses import dataclass
from io import BytesIO

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_PAGES = 30


class InvalidPdf(ValueError):
    """The upload isn't a PDF we can open, or it's too long to summarise in one go."""


@dataclass
class ExtractedPdf:
    pages: int
    text: str


def extract_text(data: bytes) -> ExtractedPdf:
    """Pulls the text layer out of every page. Scanned pages have no text layer and come back empty."""
    try:
        reader = PdfReader(BytesIO(data))
        if reader.is_encrypted:
            raise InvalidPdf(
                "This PDF is password-protected. Upload a copy without a password."
            )
        pages = len(reader.pages)
        if pages > MAX_PAGES:
            # Too long to summarise in one request; say so rather than silently dropping pages.
            raise InvalidPdf(
                f"This PDF has {pages} pages. Briefs can be at most {MAX_PAGES} pages."
            )
        text = "\n\n".join((page.extract_text() or "").strip() for page in reader.pages)
    except PdfReadError as err:
        raise InvalidPdf("This file couldn't be read as a PDF.") from err
    return ExtractedPdf(pages=pages, text=text.strip())
