from __future__ import annotations

import json
import os
from pathlib import Path
from uuid import uuid4

import requests

EVAL_FILE = Path(__file__).with_name("golden.jsonl")
API_URL = os.getenv("AI_SERVICE_URL", "http://localhost:8000").rstrip("/") + "/api/chat"


def rate(numerator: int, denominator: int) -> str:
    percentage = numerator / denominator * 100 if denominator else 0.0
    return f"{numerator}/{denominator} ({percentage:.1f}%)"


def main() -> None:
    cases = [json.loads(line) for line in EVAL_FILE.read_text(encoding="utf-8").splitlines() if line.strip()]
    answerable = [case for case in cases if case["expected_action"] == "answer"]
    unanswerable = [case for case in cases if case["expected_action"] == "escalate"]
    answerable_correct = 0
    correct_refusals = 0
    false_answers = 0
    handoffs = 0

    for case in cases:
        response = requests.post(
            API_URL,
            json={"conversation_id": f"eval-{uuid4()}", "message": case["question"]},
            timeout=90,
        )
        response.raise_for_status()
        result = response.json()
        escalated = result.get("should_escalate") is True
        handoffs += escalated

        if case["expected_action"] == "answer":
            source_titles = {source.get("title") for source in result.get("sources", [])}
            answerable_correct += int(
                result.get("grounded") is True
                and not escalated
                and case["expected_document"] in source_titles
            )
        else:
            correct_refusals += int(escalated)
            false_answers += int(not escalated)

    print(f"Answerable accuracy: {rate(answerable_correct, len(answerable))}")
    print(f"Correct-refusal rate: {rate(correct_refusals, len(unanswerable))}")
    print(f"False-answer rate: {rate(false_answers, len(unanswerable))}")
    print(f"Handoff rate: {rate(handoffs, len(cases))}")


if __name__ == "__main__":
    main()