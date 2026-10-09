from app.evaluation.grounding import evaluate_grounding

MIN_SUPPORT = 0.65


def test_changed_number_escalates():
    contexts = [{"content": "After approval, refunds appear within 5-10 business days."}]

    grounded, _, should_escalate = evaluate_grounding(
        contexts,
        "Approved refunds appear within 2 business days.",
        MIN_SUPPORT,
    )

    assert grounded is False
    assert should_escalate is True


def test_negation_flip_escalates():
    contexts = [{"content": "Final-sale items are not refundable."}]

    grounded, _, should_escalate = evaluate_grounding(
        contexts,
        "Final-sale items are refundable.",
        MIN_SUPPORT,
    )

    assert grounded is False
    assert should_escalate is True


def test_matching_number_and_negation_are_supported():
    contexts = [{
        "content": (
            "Final-sale items are not refundable. "
            "Approved refunds appear within 5-10 business days."
        ),
    }]

    grounded, _, should_escalate = evaluate_grounding(
        contexts,
        "Final-sale items are not refundable. Approved refunds appear within 5-10 business days.",
        MIN_SUPPORT,
    )

    assert grounded is True
    assert should_escalate is False


def test_courtesy_free_two_sentence_answer_is_supported():
    contexts = [{
        "content": (
            "A purchase canceled before fulfillment is eligible for a refund. "
            "Final-sale items are not refundable."
        ),
    }]

    grounded, _, should_escalate = evaluate_grounding(
        contexts,
        "A purchase canceled before fulfillment is eligible for a refund. "
        "Final-sale items are not refundable.",
        MIN_SUPPORT,
    )

    assert grounded is True
    assert should_escalate is False