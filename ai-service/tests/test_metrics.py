from app.observability.metrics import usage_and_cost


class FakeResponse:
    def __init__(self, usage_metadata=None, response_metadata=None):
        if usage_metadata is not None:
            self.usage_metadata = usage_metadata
        if response_metadata is not None:
            self.response_metadata = response_metadata


def test_usage_and_cost_prefers_usage_metadata() -> None:
    response = FakeResponse(
        usage_metadata={"input_tokens": 10, "output_tokens": 5},
        response_metadata={"token_usage": {"prompt_tokens": 999, "completion_tokens": 999}},
    )

    result = usage_and_cost(response, 1_000_000, 1_000_000)

    assert result == {
        "input_tokens": 10,
        "output_tokens": 5,
        "estimated_cost_usd": 15.0,
    }


def test_usage_and_cost_falls_back_to_response_metadata_token_usage() -> None:
    response = FakeResponse(
        response_metadata={"token_usage": {"prompt_tokens": 20, "completion_tokens": 8}},
    )

    result = usage_and_cost(response, 1_000_000, 1_000_000)

    assert result["input_tokens"] == 20
    assert result["output_tokens"] == 8
    assert result["estimated_cost_usd"] == 28.0


def test_usage_and_cost_tolerates_missing_metadata() -> None:
    result = usage_and_cost(FakeResponse(), 0.15, 0.60)

    assert result == {
        "input_tokens": 0,
        "output_tokens": 0,
        "estimated_cost_usd": 0.0,
    }
