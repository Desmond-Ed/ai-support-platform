import pytest

from app.ingestion.chunking import chunk_text


def test_chunk_text_preserves_paragraph_content_and_bounds_size() -> None:
    text = "one two three\n\nfour five six seven"

    assert chunk_text(text, max_words=3) == ["one two three", "four five six", "seven"]


def test_chunk_text_ignores_blank_paragraphs() -> None:
    assert chunk_text("  first  \n\n\n second ") == ["first", "second"]


def test_chunk_text_rejects_invalid_limit() -> None:
    with pytest.raises(ValueError, match="max_words must be positive"):
        chunk_text("content", max_words=0)