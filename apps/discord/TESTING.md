# Testing Guide - Discord Python Bot

This document describes how to run tests, linting, and type checking for the Discord Python bot.

## Prerequisites

- Python 3.13+
- uv installed ([Astral uv](https://docs.astral.sh/uv/))

## Quick Start

```bash
# Install dependencies
uv sync

# Run all tests
uv run pytest

# Run tests with coverage
uv run pytest --cov

# Run linting
uv run ruff check .

# Run formatter
uv run ruff format .

# Run type checking
uv run mypy .
```

## Continuous Integration

The CI pipeline automatically runs on every push or pull request that affects:

- Files in `apps/discord/`
- The workflow file `.github/workflows/discord-python-ci.yml`

### CI Jobs

The CI pipeline includes the following jobs:

#### 1. **Lint (Ruff)**

Checks code quality and style using Ruff linter and formatter.

```bash
# Run locally
uv run ruff check .           # Check for lint errors
uv run ruff format --check .  # Check formatting without changes
uv run ruff format .          # Auto-fix formatting
```

#### 2. **Type Check (mypy)**

Performs static type analysis to catch type-related bugs.

```bash
# Run locally
uv run mypy . --ignore-missing-imports
```

#### 3. **Test Suite**

Runs all pytest tests with comprehensive output.

```bash
# Run locally
uv run pytest                  # Run all tests
uv run pytest -v               # Verbose output
uv run pytest -k test_name     # Run specific test
uv run pytest tests/test_file.py  # Run specific file
```

#### 4. **Test Coverage**

Generates code coverage reports and uploads to Codecov.

```bash
# Run locally
uv run pytest --cov=. --cov-report=term-missing  # Terminal report
uv run pytest --cov=. --cov-report=html          # HTML report
```

Coverage reports show which lines of code are executed during tests.

#### 5. **Build Check**

Verifies Python syntax and module imports.

```bash
# Check syntax
uv run python -m py_compile *.py

# Verify imports
uv run python -c "import daily_report; import commands; import discord_client; import wol_reminder"
```

#### 6. **Security Audit**

Scans dependencies for known security vulnerabilities using Safety.

```bash
# Run locally
uv tool run safety check
```

#### 7. **Matrix Test**

Runs tests across multiple OS platforms (Ubuntu, macOS) to ensure compatibility.

## Test Organization

```typescript
apps/discord/
├── tests/                       # Test directory
│   ├── test_daily_report.py     # Daily report tests
│   └── test_wol_reminder.py     # WOL reminder tests
├── pytest.ini                   # Pytest configuration
├── ruff.toml                    # Ruff linter/formatter config
└── mypy.ini                     # mypy type checker config
```

## Writing Tests

### Basic Test Structure

```python
"""Test module description."""

import pytest
from your_module import function_to_test

class TestFeatureName:
    """Test suite for specific feature."""

    def test_basic_case(self):
        """Test basic functionality."""
        result = function_to_test(input_value)
        assert result == expected_value

    @pytest.mark.asyncio
    async def test_async_function(self):
        """Test async functionality."""
        result = await async_function()
        assert result is not None
```

### Test Markers

Use markers to categorize tests:

```python
@pytest.mark.unit        # Unit test
@pytest.mark.integration # Integration test
@pytest.mark.slow        # Slow running test
@pytest.mark.db          # Requires database
@pytest.mark.weekend     # Weekend functionality
```

Run specific categories:

```bash
uv run pytest -m unit           # Run only unit tests
uv run pytest -m "not slow"     # Skip slow tests
```

### Fixtures

Use pytest fixtures for reusable test setup:

```python
@pytest.fixture
def sample_data():
    """Provide sample data for tests."""
    return {"key": "value"}

def test_with_fixture(sample_data):
    """Test using fixture."""
    assert sample_data["key"] == "value"
```

### Mocking

Use `monkeypatch` for environment variables and external dependencies:

```python
def test_with_env_var(monkeypatch):
    """Test with mocked environment variable."""
    monkeypatch.setenv("API_KEY", "test-key")
    # Your test code here
```

## Code Quality Standards

### Formatting

- Line length: 100 characters
- Quote style: Double quotes
- Indent: 4 spaces

### Naming Conventions

- Functions/variables: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Private methods: `_leading_underscore`

### Docstrings

Use Google-style docstrings:

```python
def example_function(param1: str, param2: int) -> bool:
    """Brief description of function.

    Longer description if needed.

    Args:
        param1: Description of param1
        param2: Description of param2

    Returns:
        Description of return value

    Raises:
        ValueError: When invalid input
    """
    return True
```

## Debugging Failed Tests

### View Test Output

```bash
uv run pytest -v           # Verbose output
uv run pytest -vv          # Extra verbose
uv run pytest -s           # Show print statements
uv run pytest -l           # Show local variables in tracebacks
```

### Run Specific Tests

```bash
uv run pytest tests/test_daily_report.py::TestHelperFunctions::test_is_weekend_saturday
```

### Debug with PDB

```bash
uv run pytest --pdb        # Drop into debugger on failure
uv run pytest --trace      # Drop into debugger at start
```

### Check Coverage Gaps

```bash
uv run pytest --cov=. --cov-report=term-missing
# Shows which lines aren't covered by tests
```

## Pre-commit Checklist

Before committing code, ensure:

1. ✅ All tests pass: `uv run pytest`
2. ✅ Code is formatted: `uv run ruff format .`
3. ✅ No lint errors: `uv run ruff check .`
4. ✅ Type checking passes: `uv run mypy .`
5. ✅ Coverage maintained: `uv run pytest --cov`

## Common Issues

### Import Errors

**Problem**: `ModuleNotFoundError` when running tests

**Solution**: Ensure you're in the correct directory and dependencies are installed:

```bash
cd apps/discord
uv sync
```

### Async Test Failures

**Problem**: Tests with `async` functions fail

**Solution**: Add `@pytest.mark.asyncio` decorator:

```python
@pytest.mark.asyncio
async def test_async_function():
    result = await some_async_call()
    assert result is not None
```

### Type Check Failures

**Problem**: mypy reports type errors

**Solution**: Add type hints or ignore specific errors:

```python
from typing import Optional, List

def function(param: str) -> Optional[List[int]]:
    ...
```

Or add `# type: ignore` comment for third-party modules:

```python
import external_lib  # type: ignore[import-not-found]
```

## Resources

- [pytest documentation](https://docs.pytest.org/)
- [Ruff documentation](https://docs.astral.sh/ruff/)
- [mypy documentation](https://mypy.readthedocs.io/)
- [Coverage.py documentation](https://coverage.readthedocs.io/)
- [Python Type Hints](https://docs.python.org/3/library/typing.html)

## CI Status

Check the status of CI runs:

- Navigate to the repository's **Actions** tab on GitHub
- Look for "Discord Python CI" workflow
- Green checkmark ✅ = All checks passed
- Red X ❌ = Some checks failed (click for details)
