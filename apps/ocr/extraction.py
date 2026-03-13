import re


def extract_info(text: str):
    """
    Extracts name and student number from the extracted text.
    Updated to remove specified keywords and months before processing.
    Handles names split across lines and formats uppercase names correctly.
    """
    print(f"Processing text for extraction: '{text}'")

    # Define the excluded keywords, including months of the year
    excluded_keywords = r"(RMIT|Student|STUDENT|UNIVERSITY|SINH\sVIEN|January|February|March|April|May|June|July|August|September|October|November|December)"

    # Remove excluded keywords from the text
    cleaned_text = re.sub(excluded_keywords, "", text, flags=re.IGNORECASE)
    print(f"Cleaned text: '{cleaned_text}'")

    # Try multiple patterns for more flexibility
    patterns = [
        # Original pattern
        r"([A-Z][a-zA-Z]+(?:[\s\n]+[A-Z][a-zA-Z]+)*)\s*\n*\s*(\d{7})",
        # More flexible pattern for names and student numbers
        r"([A-Za-z]+(?:[\s\n]+[A-Za-z]+)+).*?(\d{7})",
        # Even more flexible - any sequence of letters followed by 7 digits
        r"([A-Za-z\s]+).*?(\d{7})",
        # Look for 7 digits anywhere and try to find name before it
        r"([A-Za-z]+(?:\s+[A-Za-z]+)+).*?(\d{7})",
    ]

    for i, pattern in enumerate(patterns):
        match = re.search(pattern, cleaned_text, re.MULTILINE | re.DOTALL)
        if match:
            print(f"Pattern {i + 1} matched: {match.groups()}")
            name, student_number = match.groups()

            # Clean and format the name
            name = re.sub(r"\s+", " ", name.strip())  # Replace multiple spaces with single space
            name_parts = name.split()
            formatted_name_parts = [
                part.capitalize() if part.isupper() or part.islower() else part
                for part in name_parts
                if len(part) > 1  # Filter out single characters
            ]

            if formatted_name_parts and len(student_number) == 7:
                formatted_name = " ".join(formatted_name_parts)
                print(
                    f"Successfully extracted: name='{formatted_name}', student_number='{student_number}'"
                )
                return formatted_name.strip(), student_number.strip()

    print("No patterns matched")
    return None
