# Consultly AI service (FastAPI)

Reads PDF briefs (pypdf) and turns them into consultant prep sheets with Claude, and answers the Help chat from the site's help topics plus the signed-in user's bookings. Runs on port 8000 and is called only by the API.

Without `ANTHROPIC_API_KEY` in `ai/.env` it still works: briefs are stored without a summary, and the chat answers from pre-written help topics. `CLAUDE_MODEL` picks the model (default `claude-haiku-5-5`).

```bash
uv sync
uv run uvicorn ai.main:app --port 8000 --reload
uv run pytest
uv run python scripts/make_sample_pdfs.py   # rebuild the sample brief PDFs
```

Code map: `src/ai/pdf.py` (text extraction), `prep_sheet.py` (structured prep sheets), `support.py` + `help_topics.py` (Help assistant), `models.py` (model choice), `main.py` (endpoints).
