"""Handlers must not expose or print raw exception text."""

import ast
import asyncio
import textwrap
from pathlib import Path

import pytest

import commands
from commands import CommandHandler
from error_reporting import report_error, user_error

SYNTHETIC_DETAIL = "SYNTHETIC_INTERNAL_DETAIL_NEVER_SHOWN"
DISCORD_DIR = Path(__file__).resolve().parents[1]
GUARDED_FILES = ("app.py", "commands.py", "error_reporting.py")

# Calls that reach users (responses) or logs (print/logging) and therefore
# must never receive exception-derived text inside an `except ... as name`.
SINK_CALLS = {
    "print",
    "send_response",
    "send_followup",
    "edit_response",
    "followup",
    "HTTPException",
    "debug",
    "info",
    "warning",
    "error",
    "exception",
    "critical",
    "log",
}
# Calls that consume the exception without exposing its text.
SANITIZERS = {"report_error", "reply_error", "user_error", "isinstance", "type", "len"}


def _call_name(node: ast.Call) -> str:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return ""


def _is_tainted(node: ast.AST, tainted: set[str]) -> bool:
    """True when ``node`` derives from a tainted name outside a sanitizer call.

    Covers aliases, str/repr/format, f-strings, attributes (``e.args``),
    subscripts and containers such as dict/list/tuple literals.
    """
    if isinstance(node, ast.Call) and _call_name(node) in SANITIZERS:
        return False
    if isinstance(node, ast.Name):
        return node.id in tainted
    return any(_is_tainted(child, tainted) for child in ast.iter_child_nodes(node))


def _is_sink_reference(node: ast.AST, sink_aliases: set[str]) -> bool:
    if isinstance(node, ast.Name):
        return node.id in SINK_CALLS or node.id in sink_aliases
    return isinstance(node, ast.Attribute) and node.attr in SINK_CALLS


def _assigned_names(target: ast.AST) -> list[str]:
    return [node.id for node in ast.walk(target) if isinstance(node, ast.Name)]


def _propagate(handler: ast.ExceptHandler) -> tuple[set[str], set[str]]:
    """Fixpoint of names tainted by, or aliasing a sink within, the block."""
    tainted: set[str] = {handler.name or ""}
    sink_aliases: set[str] = set()
    assignments: list[tuple[list[ast.AST], ast.AST]] = []
    for statement in handler.body:
        for node in ast.walk(statement):
            if isinstance(node, ast.Assign):
                assignments.append((node.targets, node.value))
            elif isinstance(node, (ast.AnnAssign, ast.AugAssign, ast.NamedExpr)):
                if node.value is not None:
                    assignments.append(([node.target], node.value))
            elif isinstance(node, (ast.For, ast.AsyncFor, ast.comprehension)):
                assignments.append(([node.target], node.iter))
            elif isinstance(node, ast.withitem) and node.optional_vars is not None:
                assignments.append(([node.optional_vars], node.context_expr))
    changed = True
    while changed:
        changed = False
        for targets, value in assignments:
            for target in targets:
                for name in _assigned_names(target):
                    if name not in tainted and _is_tainted(value, tainted):
                        tainted.add(name)
                        changed = True
                    if name not in sink_aliases and _is_sink_reference(value, sink_aliases):
                        sink_aliases.add(name)
                        changed = True
    return tainted, sink_aliases


def exception_exposures(source: str) -> list[tuple[int, str]]:
    """(line, sink) pairs where an except block passes exception data on."""
    found: set[tuple[int, str]] = set()
    for handler in ast.walk(ast.parse(source)):
        if not isinstance(handler, ast.ExceptHandler) or not handler.name:
            continue
        tainted, sink_aliases = _propagate(handler)
        for statement in handler.body:
            for node in ast.walk(statement):
                if isinstance(node, ast.Return) and node.value is not None:
                    if _is_tainted(node.value, tainted):
                        found.add((node.lineno, "return"))
                elif isinstance(node, ast.Call) and _is_sink_reference(node.func, sink_aliases):
                    arguments = [*node.args, *(keyword.value for keyword in node.keywords)]
                    if any(_is_tainted(argument, tainted) for argument in arguments):
                        name = _call_name(node)
                        found.add((node.lineno, name))
    return sorted(found)


def test_guard_detects_every_exposure_shape() -> None:
    source = textwrap.dedent(
        """
        async def handler(client, logger):
            try:
                pass
            except Exception as e:
                print(f"failed: {e}")
                logger.error("failed: %s", e)
                logger.warning(str(e))
                await client.send_response({"content": f"Error: {e!s}"}, 1, 2)
                await client.send_followup(content=repr(e))
                raise HTTPException(status_code=500, detail=str(e))
                return {"content": f"Error: {e}"}
        """
    )
    sinks = [sink for _line, sink in exception_exposures(source)]
    assert sorted(sinks) == sorted(
        ["print", "error", "warning", "send_response", "send_followup", "HTTPException", "return"]
    )


@pytest.mark.parametrize(
    ("label", "body", "sink"),
    [
        (
            "stringified local",
            'detail = str(e)\nawait client.send_response({"content": detail}, 1, 2)',
            "send_response",
        ),
        ("exception alias", 'err = e\nprint(f"failed: {err}")', "print"),
        ("chained alias", "err = e\nmessage = repr(err)\nlogger.info(message)", "info"),
        (
            "sink alias",
            'send = client.send_response\nawait send({"content": f"{e}"}, 1, 2)',
            "send",
        ),
        ("print alias", "emit = print\nemit(e)", "emit"),
        ("args subscript", 'return {"content": e.args[0]}', "return"),
        ("container", 'payload = [("detail", e)]\nreturn payload', "return"),
        (
            "concatenation",
            'text = "failed: " + str(e)\nawait client.send_followup(content=text)',
            "send_followup",
        ),
        ("walrus", "if (detail := str(e)):\n    print(detail)", "print"),
    ],
)
def test_guard_follows_simple_local_taint(label: str, body: str, sink: str) -> None:
    source = (
        "async def handler(client, logger):\n    try:\n        pass\n    except Exception as e:\n"
    )
    source += textwrap.indent(body, "        ") + "\n"
    assert [found for _line, found in exception_exposures(source)] == [sink], label


def test_guard_allows_reporting_through_the_helper() -> None:
    source = textwrap.dedent(
        """
        async def handler(handler, client):
            try:
                pass
            except Exception as e:
                error_id = report_error("context", e)
                await handler.reply_error(1, 2, "context", e, "Could not do it.")
                await client.send_response({"content": user_error("Failed.", error_id)}, 1, 2)
                return {"content": "Could not do it."}
        """
    )
    assert exception_exposures(source) == []


@pytest.mark.parametrize("filename", GUARDED_FILES)
def test_handlers_do_not_expose_exception_text(filename: str) -> None:
    source = (DISCORD_DIR / filename).read_text(encoding="utf-8")
    assert exception_exposures(source) == [], filename


def test_report_error_logs_one_escaped_line_with_correlation_id(capsys) -> None:
    try:
        raise RuntimeError(f"line one\r\n[forged] {SYNTHETIC_DETAIL}\x1b[31m")
    except RuntimeError as error:
        error_id = report_error("unit test\ncontext", error)

    output = capsys.readouterr().out
    assert output.count("\n") == 1
    assert "\r" not in output
    assert "\x1b" not in output
    assert f"[error_id={error_id}]" in output
    assert "unit test\\ncontext failed" in output
    assert "RuntimeError" in output
    assert len(error_id) == 8


def test_user_error_never_contains_exception_text() -> None:
    message = user_error("Could not load lists.", "abcd1234")
    assert message == (
        "❌ **Error:** Could not load lists. Please try again. (Error ID: `abcd1234`)"
    )


def test_reply_error_sends_fixed_text_with_correlation_id(capsys) -> None:
    sent: list[dict] = []

    class RecordingClient:
        async def send_response(self, data: dict, _app_id: str, _token: str) -> None:
            sent.append(data)

    handler = CommandHandler.__new__(CommandHandler)
    handler.discord_client = RecordingClient()

    asyncio.run(
        handler.reply_error(
            "app", "token", "lists command", RuntimeError(SYNTHETIC_DETAIL), "Failed."
        )
    )

    content = sent[0]["content"]
    assert SYNTHETIC_DETAIL not in content
    assert content.startswith("❌ **Error:** Failed. Please try again. (Error ID: `")
    error_id = content.rsplit("`", 2)[1]
    assert f"[error_id={error_id}]" in capsys.readouterr().out


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
