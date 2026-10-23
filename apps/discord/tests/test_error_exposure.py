"""Interaction responses must not echo internal exception details to users."""

import ast
from pathlib import Path

import commands
from commands import CommandHandler

SYNTHETIC_DETAIL = "SYNTHETIC_INTERNAL_DETAIL_NEVER_SHOWN"
DISCORD_DIR = Path(__file__).resolve().parents[1]


def test_ticket_form_failure_returns_generic_message(monkeypatch) -> None:
    def failing_client() -> None:
        raise RuntimeError(SYNTHETIC_DETAIL)

    monkeypatch.setattr(commands, "get_supabase_client", failing_client)
    handler = CommandHandler.__new__(CommandHandler)

    response = handler.create_ticket_form_modal("synthetic-list-id")

    content = response["data"]["content"]
    assert SYNTHETIC_DETAIL not in content
    assert content == "❌ **Error:** Could not create the ticket form."
    assert response["data"]["flags"] == 64


def returned_exception_formats(path: Path) -> list[int]:
    """Lines where a `return` inside `except ... as name` formats `name`."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    return [
        value.lineno
        for handler in ast.walk(tree)
        if isinstance(handler, ast.ExceptHandler) and handler.name
        for statement in handler.body
        for node in ast.walk(statement)
        if isinstance(node, ast.Return) and node.value is not None
        for value in ast.walk(node.value)
        if isinstance(value, ast.FormattedValue)
        and isinstance(value.value, ast.Name)
        and value.value.id == handler.name
    ]


def test_interaction_handlers_do_not_return_exception_text() -> None:
    for filename in ("app.py", "commands.py"):
        assert returned_exception_formats(DISCORD_DIR / filename) == [], filename
