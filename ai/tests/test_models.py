from ai.models import DEFAULT_MODEL, current_model, fallback_params


def test_defaults_to_the_cheapest_model(monkeypatch):
    monkeypatch.delenv("CLAUDE_MODEL", raising=False)
    assert current_model() == DEFAULT_MODEL == "claude-haiku-5-5"


def test_claude_model_in_env_overrides_it(monkeypatch):
    monkeypatch.setenv("CLAUDE_MODEL", "claude-sonnet-5-5")
    assert current_model() == "claude-sonnet-5-5"
    monkeypatch.setenv(
        "CLAUDE_MODEL", ""
    )  # an empty line in .env means "use the default"
    assert current_model() == "claude-haiku-5-5"


def test_refusal_fallback_is_only_sent_to_models_that_support_it():
    assert (
        fallback_params("claude-haiku-5-5") == {}
    )  # Haiku has no server-side fallback; sending it would be an error
    assert fallback_params("claude-sonnet-5-5") == {
        "betas": ["server-side-fallback-2026-07-01"],
        "fallbacks": "default",
    }
