from __future__ import annotations

import re

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
NEGATION_PATTERN = re.compile(r"\b(?:not|no|never|cannot|can't)\b|n['’]t\b|\bnon-", re.IGNORECASE)
NUMBER_WORDS = {
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "eleven": "11",
    "twelve": "12",
    "thirteen": "13",
    "fourteen": "14",
    "fifteen": "15",
    "sixteen": "16",
    "seventeen": "17",
    "eighteen": "18",
    "nineteen": "19",
    "twenty": "20",
    "thirty": "30",
    "forty": "40",
    "fifty": "50",
    "sixty": "60",
    "seventy": "70",
    "eighty": "80",
    "ninety": "90",
    "hundred": "100",
    "thousand": "1000",
}
DURATION_PATTERN = re.compile(
    r"\b(?:(business|calendar)\s+)?(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b",
    re.IGNORECASE,
)
SENTENCE_SPLIT_PATTERN = re.compile(r"(?<=[.!?])\s+|[\r\n]+")
WORD_PATTERN = re.compile(r"[a-z0-9]+", re.IGNORECASE)


def _sentences(text: str) -> list[str]:
    return [
        sentence
        for part in SENTENCE_SPLIT_PATTERN.split(text)
        if (sentence := re.sub(r"^\s*(?:[-*+]\s*|#{1,6}\s*)", "", part).strip())
    ]


def _content_words(sentence: str) -> list[str]:
    return [
        word
        for word in WORD_PATTERN.findall(sentence.lower())
        if len(word) > 2 and word not in STOPWORDS
    ]


def _number_facts(sentence: str) -> set[str]:
    facts = set()
    for token in WORD_PATTERN.findall(sentence.lower()):
        if token.isdigit():
            facts.add(str(int(token)))
        elif token in NUMBER_WORDS:
            facts.add(NUMBER_WORDS[token])
    return facts


def _duration_facts(sentence: str) -> set[str]:
    facts = set()
    for match in DURATION_PATTERN.finditer(sentence.lower()):
        qualifier = match.group(1) or ""
        unit = match.group(2).rstrip("s")
        facts.add(f"{qualifier} {unit}".strip())
    return facts


def evaluate_grounding(
    contexts: list[dict], answer: str, answer_min_support: float
) -> tuple[bool, float, bool]:
    """Return grounding, weakest sentence support, and escalation without I/O."""
    if not contexts:
        return False, 0.0, True

    context_sentences = [
        sentence
        for item in contexts
        for sentence in _sentences(str(item.get("content", "")))
    ]
    context_word_sets = [_content_words(sentence) for sentence in context_sentences]
    answer_supports = []
    should_escalate = False

    for answer_sentence in _sentences(answer):
        answer_words = _content_words(answer_sentence)
        if not answer_words:
            continue

        best_match = None
        best_support = 0.0
        for context_sentence, context_words in zip(context_sentences, context_word_sets):
            support = sum(word in context_words for word in answer_words) / len(answer_words)
            if best_match is None or support > best_support:
                best_match = context_sentence
                best_support = support

        answer_supports.append(best_support)
        if best_match is None:
            should_escalate = True
            continue

        if best_support < answer_min_support:
            should_escalate = True
        if bool(NEGATION_PATTERN.search(answer_sentence)) != bool(NEGATION_PATTERN.search(best_match)):
            should_escalate = True
        if not _number_facts(answer_sentence).issubset(_number_facts(best_match)):
            should_escalate = True
        if not _duration_facts(answer_sentence).issubset(_duration_facts(best_match)):
            should_escalate = True

    if not answer_supports:
        return False, 0.0, True

    support = min(answer_supports)
    return not should_escalate, round(support, 4), should_escalate
