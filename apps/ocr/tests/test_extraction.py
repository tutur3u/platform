import pytest

from extraction import extract_info


@pytest.mark.unit
def test_extract_info_basic_rmit_card():
    text = """
	RMIT UNIVERSITY
	STUDENT
	JOHN DOE
	1234567
	""".strip()

    result = extract_info(text)

    assert result is not None
    name, student_number = result
    assert name == "John Doe"
    assert student_number == "1234567"


@pytest.mark.unit
def test_extract_info_ignores_keywords_and_months():
    text = """
	RMIT UNIVERSITY STUDENT
	January 2024
	JANE SMITH
	7654321
	""".strip()

    result = extract_info(text)

    assert result is not None
    name, student_number = result
    assert name == "Jane Smith"
    assert student_number == "7654321"


@pytest.mark.unit
def test_extract_info_name_split_across_lines():
    text = """
	RMIT
	STUDENT
	JOHN
	MIDDLE
	DOE
	2345678
	""".strip()

    result = extract_info(text)

    assert result is not None
    name, student_number = result
    assert name == "John Middle Doe"
    assert student_number == "2345678"


@pytest.mark.unit
def test_extract_info_returns_none_when_no_match():
    text = """
	RMIT UNIVERSITY
	No id number here
	Just some random text
	""".strip()

    result = extract_info(text)

    assert result is None
