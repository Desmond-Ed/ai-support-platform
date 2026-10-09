from __future__ import annotations

import re

from app.core.config import get_settings

STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any",
    "are", "as", "at", "be", "because", "been", "before", "being", "below", "between",
    "both", "but", "by", "can", "could", "did", "do", "does", "doing", "down", "during",
    "each", "few", "for", "from", "further", "had", "has", "have", "having", "he", "her",
    "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into",
    "is", "it", "its", "itself", "just", "me", "more", "most", "my", "myself", "no", "nor",
    "not", "now", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "ourselves",
    "out", "over", "own", "same", "she", "should", "so", "some", "such", "than", "that",
    "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this",
    "those", "through", "to", "too", "under", "until", "up", "very", "was", "we", "were",
    "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with", "would",
    "you", "your", "yours", "yourself", "yourselves",
}


def evaluate_grounding(contexts: list[dict], answer: str) -> tuple[bool, float, bool]:
    """Return (grounded, answer-support fraction, should-escalate)."""
    if not contexts:
        return False, 0.0, True

    answer_words = [
        word
        for word in re.findall(r"[a-z0-9]+", answer.lower())
        if len(word) > 2 and word not in STOPWORDS
    ]
    if not answer_words:
        return False, 0.0, True

    context_text = " ".join(str(item.get("content", "")) for item in contexts).lower()
    context_words = set(re.findall(r"[a-z0-9]+", context_text))

    support = sum(word in context_words for word in answer_words) / len(answer_words)
    should_escalate = support < get_settings().ANSWER_MIN_SUPPORT
    return not should_escalate, round(support, 4), should_escalate
