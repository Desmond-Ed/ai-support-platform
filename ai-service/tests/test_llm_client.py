import asyncio

import pytest

from app.llm import client


class FakeChatOpenAI:
    def __init__(self, **kwargs):
        self.kwargs = kwargs


class FakeRateLimitError(Exception):
    status_code = 429


class FakeLLM:
    def __init__(self, failures: int):
        self.failures = failures
        self.calls = 0

    async def ainvoke(self, _messages):
        self.calls += 1
        if self.calls <= self.failures:
            raise FakeRateLimitError("rate limited")
        return "ok"


def test_deepseek_uses_configured_model_and_base_url(monkeypatch) -> None:
    monkeypatch.setattr(client, "ChatOpenAI", FakeChatOpenAI)
    monkeypatch.setattr(client.settings, "LLM_PROVIDER", "deepseek")
    monkeypatch.setattr(client.settings, "DEEPSEEK_API_KEY", "test-key")
    monkeypatch.setattr(client.settings, "DEEPSEEK_BASE_URL", "https://api.deepseek.com/")
    monkeypatch.setattr(client.settings, "DEEPSEEK_MODEL", "deepseek-flash")

    llm = client.get_llm()

    assert llm.kwargs["model"] == "deepseek-flash"
    assert llm.kwargs["base_url"] == "https://api.deepseek.com"
    assert llm.kwargs["max_retries"] == 0


def test_openai_compatible_requires_all_settings(monkeypatch) -> None:
    monkeypatch.setattr(client.settings, "LLM_PROVIDER", "openai-compatible")
    monkeypatch.setattr(client.settings, "LLM_BASE_URL", "")
    monkeypatch.setattr(client.settings, "LLM_API_KEY", "")
    monkeypatch.setattr(client.settings, "LLM_MODEL", "")

    with pytest.raises(RuntimeError, match="LLM_BASE_URL, LLM_API_KEY, LLM_MODEL"):
        client.get_llm()


def test_openai_compatible_uses_generic_settings(monkeypatch) -> None:
    monkeypatch.setattr(client, "ChatOpenAI", FakeChatOpenAI)
    monkeypatch.setattr(client.settings, "LLM_PROVIDER", "openai-compatible")
    monkeypatch.setattr(client.settings, "LLM_BASE_URL", "https://integrate.api.nvidia.com/v1")
    monkeypatch.setattr(client.settings, "LLM_API_KEY", "test-key")
    monkeypatch.setattr(client.settings, "LLM_MODEL", "deepseek-ai/deepseek-v4.1-flash")

    llm = client.get_llm()

    assert llm.kwargs["base_url"] == "https://integrate.api.nvidia.com/v1"
    assert llm.kwargs["model"] == "deepseek-ai/deepseek-v4.1-flash"


def test_unknown_provider_is_rejected(monkeypatch) -> None:
    monkeypatch.setattr(client.settings, "LLM_PROVIDER", "unknown")

    with pytest.raises(RuntimeError, match="Unsupported LLM_PROVIDER"):
        client.get_llm()


def test_invoke_retries_rate_limits_with_backoff() -> None:
    llm = FakeLLM(failures=2)

    result = asyncio.run(client.invoke_with_retry(llm, [], max_attempts=3, base_delay=0))

    assert result == "ok"
    assert llm.calls == 3


def test_invoke_raises_clean_error_after_retries_exhausted() -> None:
    llm = FakeLLM(failures=3)

    with pytest.raises(client.LLMUnavailableError):
        asyncio.run(client.invoke_with_retry(llm, [], max_attempts=3, base_delay=0))

    assert llm.calls == 3


def test_invoke_retries_provider_busy_responses() -> None:
    class FakeBusyError(Exception):
        status_code = 503

    class BusyLLM:
        def __init__(self) -> None:
            self.calls = 0

        async def ainvoke(self, _messages):
            self.calls += 1
            if self.calls == 1:
                raise FakeBusyError("provider busy")
            return "ok"

    llm = BusyLLM()

    result = asyncio.run(client.invoke_with_retry(llm, [], max_attempts=3, base_delay=0))

    assert result == "ok"
    assert llm.calls == 2


def test_invoke_does_not_retry_other_errors() -> None:
    class FailingLLM:
        async def ainvoke(self, _messages):
            raise ValueError("bad request")

    with pytest.raises(ValueError, match="bad request"):
        asyncio.run(client.invoke_with_retry(FailingLLM(), [], base_delay=0))

def test_deepseek_requires_api_key(monkeypatch) -> None:
    monkeypatch.setattr(client.settings, "LLM_PROVIDER", "deepseek")
    monkeypatch.setattr(client.settings, "DEEPSEEK_API_KEY", "")

    with pytest.raises(RuntimeError, match="DEEPSEEK_API_KEY"):
        client.get_llm()


def test_openai_requires_api_key(monkeypatch) -> None:
    monkeypatch.setattr(client.settings, "LLM_PROVIDER", "openai")
    monkeypatch.setattr(client.settings, "OPENAI_API_KEY", "")

    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        client.get_llm()
