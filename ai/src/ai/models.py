import os

DEFAULT_MODEL = "claude-haiku-5-5"  # the cheapest current model; override with CLAUDE_MODEL in ai/.env

# Server-side refusal fallback: if a safety classifier declines, the API retries on another model in the same call.
# Only some models offer it (Claude Haiku 5.5 does not), and sending it to others is an error.
SUPPORTS_FALLBACK = {
    "claude-sonnet-5-5",
    "claude-opus-5-5",
    "claude-opus-5",
    "claude-fable-5-1",
}


def current_model() -> str:
    """Read at call time, so the setting from ai/.env (loaded at startup) always applies."""
    return os.environ.get("CLAUDE_MODEL") or DEFAULT_MODEL


def fallback_params(model: str) -> dict:
    return (
        {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
        if model in SUPPORTS_FALLBACK
        else {}
    )
