"""Writes the demo brief PDFs into api/prisma/samples/ from the plain-text sources next to them.

A tiny hand-rolled PDF writer (Helvetica, word-wrapped, multi-page) so the samples are real
text PDFs that pypdf can read, without adding a PDF-drawing dependency. Run: uv run python scripts/make_sample_pdfs.py
"""

import textwrap
from pathlib import Path

SAMPLES = Path(__file__).resolve().parents[2] / "api" / "prisma" / "samples"
LINES_PER_PAGE = 46


def escape(s: str) -> str:
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def wrap(text: str) -> list[tuple[str, bool]]:
    """(line, is_heading) pairs; '# ' lines are headings, blank lines are kept."""
    out: list[tuple[str, bool]] = []
    for para in text.splitlines():
        if para.startswith("# "):
            out += [("", False), (para[2:], True)]
        elif not para.strip():
            out.append(("", False))
        else:
            indent = "    " if para.startswith("- ") else ""
            out += [
                (line, False)
                for line in textwrap.wrap(para, 92, subsequent_indent=indent)
            ]
    return out


def build_pdf(text: str) -> bytes:
    lines = wrap(text)
    pages = [
        lines[i : i + LINES_PER_PAGE] for i in range(0, len(lines), LINES_PER_PAGE)
    ]
    objects: list[bytes] = []

    def add(body: bytes) -> int:
        objects.append(body)
        return len(objects)

    add(b"<< /Type /Catalog /Pages 2 0 R >>")
    add(b"")  # pages tree, filled in once the page ids are known
    regular = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    bold = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    page_ids = []
    for page in pages:
        ops = ["BT", "14 TL", "56 790 Td"]
        for line, heading in page:
            ops.append(
                f"/F{2 if heading else 1} {12 if heading else 10.5} Tf ({escape(line)}) Tj T*"
            )
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        content = add(
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream"
        )
        page_ids.append(
            add(
                b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents %d 0 R "
                b"/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> >>"
                % (content, regular, bold)
            )
        )
    kids = " ".join(f"{i} 0 R" for i in page_ids).encode()
    objects[1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (kids, len(page_ids))

    pdf = bytearray(b"%PDF-1.4\n")
    offsets = []
    for n, body in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    xref = len(pdf)
    pdf += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    pdf += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    pdf += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (
        len(objects) + 1,
        xref,
    )
    return bytes(pdf)


if __name__ == "__main__":
    for source in sorted(SAMPLES.glob("*.txt")):
        target = source.with_suffix(".pdf")
        target.write_bytes(build_pdf(source.read_text()))
        print(f"wrote {target.relative_to(SAMPLES.parents[2])}")
