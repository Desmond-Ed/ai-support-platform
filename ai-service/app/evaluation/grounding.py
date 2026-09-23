from __future__ import annotations

import re


def evaluate_grounding(contexts: list[dict], answer: str) -> tuple[bool, float, bool]:
    """Return (grounded, confidence, should_escalate)."""
    if not contexts:
        return False, 0.0, True

    normalized = re.sub(r"\s+", " ", answer.lower()).strip()
    if not normalized:
        return False, 0.0, True

    context_text = " ".join(str(item.get("content", "")) for item in contexts).lower()
    context_tokens = set(re.findall(r"\w+", context_text))
    answer_tokens = set(re.findall(r"\w+", normalized))

    overlap = len(context_tokens & answer_tokens) / max(len(answer_tokens), 1)
    grounded = overlap > 0.0
    confidence = min(max(overlap * 1.5, 0.0), 1.0)
    should_escalate = not grounded or confidence < 0.5
    return grounded, round(confidence, 4), should_escalate
