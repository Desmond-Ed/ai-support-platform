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
    failed_cases = []

    for case in cases:
        response = requests.post(
            API_URL,
            json={"conversation_id": f"eval-{uuid4()}", "message": case["question"]},
            timeout=90,
        )
        response.raise_for_status()
        result = response.json()
        escalated = result.get("should_escalate") is True
        answer_text = str(result.get("content", ""))
        normalized_answer = answer_text.casefold()
        handoffs += escalated

        if case["expected_action"] == "answer":
            source_titles = {source.get("title") for source in result.get("sources", [])}
            correct = (
                result.get("grounded") is True
                and not escalated
                and case["expected_document"] in source_titles
                and all(
                    required.casefold() in normalized_answer
                    for required in case.get("must_contain", [])
                )
                and all(
                    forbidden.casefold() not in normalized_answer
                    for forbidden in case.get("must_not_contain", [])
                )
            )
            answerable_correct += int(correct)
        else:
            correct_refusals += int(escalated)
            false_answers += int(not escalated)
            correct = escalated

        if not correct:
            failed_cases.append((case["question"], answer_text[:200]))

    print(f"Answerable accuracy: {rate(answerable_correct, len(answerable))}")
    print(f"Correct-refusal rate: {rate(correct_refusals, len(unanswerable))}")
    print(f"False-answer rate: {rate(false_answers, len(unanswerable))}")
    print(f"Handoff rate: {rate(handoffs, len(cases))}")
    for question, response_text in failed_cases:
        print(f"Failed case: {question}\nResponse: {response_text}")


if __name__ == "__main__":
    main()