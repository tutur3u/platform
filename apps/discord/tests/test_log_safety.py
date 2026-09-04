import ast
from pathlib import Path

import pytest

import app as discord_app

SYNTHETIC_SENTINEL = "SYNTHETIC_LOG_SAFETY_SENTINEL_NEVER_A_REAL_TOKEN"


class UnauthorizedResponse:
    status_code = 401
    text = "synthetic unauthorized response"


def assert_token_not_logged(output: str) -> None:
    assert SYNTHETIC_SENTINEL not in output
    assert SYNTHETIC_SENTINEL[:10] not in output
    assert SYNTHETIC_SENTINEL[-10:] not in output


def unexpected_request(*_args: object, **_kwargs: object) -> None:
    raise AssertionError("Discord API must not be called without a configured token")


def test_bot_token_does_not_log_configured_token(monkeypatch, capsys) -> None:
    monkeypatch.setenv("DISCORD_BOT_TOKEN", SYNTHETIC_SENTINEL)
    monkeypatch.setenv("DISCORD_CLIENT_ID", "synthetic-client-id")
    monkeypatch.setattr(
        discord_app.requests, "get", lambda *_args, **_kwargs: UnauthorizedResponse()
    )

    assert discord_app.test_bot_token.local() is False

    output = capsys.readouterr().out
    assert "BOT_TOKEN is configured" in output
    assert_token_not_logged(output)


def test_bot_token_rejects_absent_token_without_request(monkeypatch, capsys) -> None:
    monkeypatch.delenv("DISCORD_BOT_TOKEN", raising=False)
    monkeypatch.setenv("DISCORD_CLIENT_ID", "synthetic-client-id")
    monkeypatch.setattr(discord_app.requests, "get", unexpected_request)

    with pytest.raises(Exception, match="DISCORD_BOT_TOKEN environment variable is not set"):
        discord_app.test_bot_token.local()

    assert_token_not_logged(capsys.readouterr().out)


def test_create_slash_command_does_not_log_configured_token(monkeypatch, capsys) -> None:
    class SyntheticCommandHandler:
        def get_command_definitions(self) -> list[dict[str, object]]:
            return []

    monkeypatch.setenv("DISCORD_BOT_TOKEN", SYNTHETIC_SENTINEL)
    monkeypatch.setenv("DISCORD_CLIENT_ID", "synthetic-client-id")
    monkeypatch.setattr(discord_app, "CommandHandler", SyntheticCommandHandler)
    monkeypatch.setattr(
        discord_app.requests, "get", lambda *_args, **_kwargs: UnauthorizedResponse()
    )

    with pytest.raises(Exception, match="401 Unauthorized"):
        discord_app.create_slash_command.local()

    output = capsys.readouterr().out
    assert "BOT_TOKEN is configured" in output
    assert_token_not_logged(output)


def test_create_slash_command_rejects_absent_token_without_request(monkeypatch, capsys) -> None:
    monkeypatch.delenv("DISCORD_BOT_TOKEN", raising=False)
    monkeypatch.setenv("DISCORD_CLIENT_ID", "synthetic-client-id")
    monkeypatch.setattr(discord_app.requests, "get", unexpected_request)

    with pytest.raises(Exception, match="DISCORD_BOT_TOKEN environment variable is not set"):
        discord_app.create_slash_command.local()

    assert_token_not_logged(capsys.readouterr().out)


def test_token_is_never_sliced_or_passed_to_logging_calls() -> None:
    source = (Path(__file__).parents[1] / "app.py").read_text()
    tree = ast.parse(source)
    target_names = {"test_bot_token", "create_slash_command"}
    functions = {
        node.name: node
        for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name in target_names
    }

    assert functions.keys() == target_names

    for function in functions.values():
        for node in ast.walk(function):
            if isinstance(node, ast.Subscript) and isinstance(node.value, ast.Name):
                assert node.value.id != "bot_token"

            if not isinstance(node, ast.Call):
                continue

            is_print = isinstance(node.func, ast.Name) and node.func.id == "print"
            is_logger = (
                isinstance(node.func, ast.Attribute)
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id in {"logger", "logging"}
            )
            if not (is_print or is_logger):
                continue

            logged_names = {
                child.id
                for argument in [*node.args, *[item.value for item in node.keywords]]
                for child in ast.walk(argument)
                if isinstance(child, ast.Name)
            }
            assert "bot_token" not in logged_names
