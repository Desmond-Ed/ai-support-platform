from __future__ import annotations

import re


def chunk_text(text: str, max_words: int = 180) -> list[str]:
    """Split text into bounded, paragraph-aware chunks."""
    if max_words < 1:
        raise ValueError("max_words must be positive")

    paragraphs = [paragraph.strip() for paragraph in re.split(r"\n\s*\n", text) if paragraph.strip()]
    chunks: list[str] = []
    for paragraph in paragraphs:
        words = paragraph.split()
        for start in range(0, len(words), max_words):
            chunks.append(" ".join(words[start : start + max_words]))
    return chunks