"""Utility functions for the Discord bot."""

import re
from urllib.parse import urlparse

import nanoid
from config import DEFAULT_SLUG_LENGTH, MAX_SLUG_LENGTH


def is_valid_url(url: str) -> bool:
    """Validate URL format."""
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except:
        return False


def is_valid_slug(slug: str) -> bool:
    """Validate custom slug format."""
    if not slug or len(slug) > MAX_SLUG_LENGTH:
        return False
    # Only allow letters, numbers, hyphens, and underscores
    return bool(re.match(r"^[a-zA-Z0-9_-]+$", slug))


def generate_slug(length: int = DEFAULT_SLUG_LENGTH) -> str:
    """Generate a random slug."""
    return nanoid.generate(size=length)


def extract_domain(url: str) -> str:
    """Extract domain from URL."""
    return urlparse(url).netloc


def get_base_url() -> str:
    """Get the base URL for shortened links based on environment."""
    import os

    return (
        "https://tuturuuu.com"
        if os.getenv("NODE_ENV") == "production"
        else "http://localhost:3002"
    )
