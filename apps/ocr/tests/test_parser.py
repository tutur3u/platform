import pytest

from parser import parse_result


@pytest.mark.unit
def test_parse_result_empty_returns_empty_string():
    assert parse_result([]) == ""


@pytest.mark.unit
def test_parse_result_basic_structure_with_confident_text():
    result = [
        {
            "rec_texts": ["RMIT", "UNIVERSITY", "JOHN", "DOE", "1234567"],
            "rec_scores": [0.9, 0.95, 0.92, 0.93, 0.99],
        }
    ]

    text = parse_result(result)

    # All texts have confidence > 0.5, so all should be joined
    assert text == "RMIT UNIVERSITY JOHN DOE 1234567"


@pytest.mark.unit
def test_parse_result_filters_low_confidence_items():
    result = [
        {
            "rec_texts": ["RMIT", "NOISY", "JOHN", "DOE"],
            "rec_scores": [0.9, 0.3, 0.91, 0.92],
        }
    ]

    text = parse_result(result)

    # "NOISY" has low confidence and should be filtered out
    assert text == "RMIT JOHN DOE"


@pytest.mark.unit
def test_parse_result_raises_keyerror_when_rec_texts_missing():
    # When rec_texts key is missing, KeyError should be raised
    result = [
        {
            "wrong_key": ["TEXT"],
            "rec_scores": [0.9],
        }
    ]

    with pytest.raises(KeyError, match="rec_texts"):
        parse_result(result)
