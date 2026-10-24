"""Handlers must not expose or print raw exception text."""

import ast
import asyncio
import logging
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
# Calls whose *result* never carries exception text (their arguments are still
# checked; see EXCEPTION_KEYWORD_SINKS).
SAFE_RESULTS = {"report_error", "reply_error", "isinstance", "type", "len"}
# Helpers whose `error=` keyword may carry the handled exception itself. That
# keyword is the only exempt argument, and only when its value is exactly the
# handler's bound exception name (or `sys.exception()`). Every positional and
# every other keyword argument is checked, so no binding inference is needed.
# `user_error` is deliberately absent: it interpolates its inputs, so it
# propagates taint like any other call.
EXCEPTION_KEYWORD_SINKS = {"report_error", "reply_error"}
# Calls that read the active exception without naming it.
TRACEBACK_SOURCES = {"format_exc", "format_exception", "format_exception_only", "format_tb"}
SYS_SOURCES = {"exc_info", "exception"}


def _call_name(node: ast.Call) -> str:
    if isinstance(node.func, ast.Name):
        return node.func.id
    if isinstance(node.func, ast.Attribute):
        return node.func.attr
    return ""


def _is_implicit_source(node: ast.Call) -> bool:
    func = node.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        module = func.value.id
        return (module == "traceback" and func.attr in TRACEBACK_SOURCES) or (
            module == "sys" and func.attr in SYS_SOURCES
        )
    return isinstance(func, ast.Name) and func.id in TRACEBACK_SOURCES | {"exc_info"}


def _is_tainted(node: ast.AST, tainted: set[str]) -> bool:
    """True when ``node`` derives from the handled exception.

    Covers aliases, str/repr/format, f-strings, attributes (``e.args``),
    subscripts, containers and implicit sources such as
    ``traceback.format_exc()`` or ``sys.exc_info()[1]``.
    """
    if isinstance(node, ast.Call):
        if _is_implicit_source(node):
            return True
        if _call_name(node) in SAFE_RESULTS:
            return False
    if isinstance(node, ast.Name):
        return node.id in tainted
    return any(_is_tainted(child, tainted) for child in ast.iter_child_nodes(node))


def _is_sink_reference(node: ast.AST, sink_aliases: set[str]) -> bool:
    if isinstance(node, ast.Name):
        return node.id in SINK_CALLS or node.id in sink_aliases
    return isinstance(node, ast.Attribute) and node.attr in SINK_CALLS


def _is_exempt_exception_keyword(keyword: ast.keyword, bound_name: str | None) -> bool:
    if keyword.arg != "error":
        return False
    value = keyword.value
    if isinstance(value, ast.Name):
        return bound_name is not None and value.id == bound_name
    return (
        isinstance(value, ast.Call)
        and not value.args
        and not value.keywords
        and isinstance(value.func, ast.Attribute)
        and isinstance(value.func.value, ast.Name)
        and value.func.value.id == "sys"
        and value.func.attr == "exception"
    )


def _checked_helper_arguments(node: ast.Call, bound_name: str | None) -> list[ast.AST]:
    """Every argument except an exact `error=<bound exception>` keyword."""
    keywords = [
        keyword.value
        for keyword in node.keywords
        if not _is_exempt_exception_keyword(keyword, bound_name)
    ]
    return [*node.args, *keywords]


def _assigned_names(target: ast.AST) -> list[str]:
    return [node.id for node in ast.walk(target) if isinstance(node, ast.Name)]


def _propagate(handler: ast.ExceptHandler) -> tuple[set[str], set[str]]:
    """Fixpoint of names tainted by, or aliasing a sink within, the block."""
    tainted: set[str] = {handler.name} if handler.name else set()
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
    """(line, sink) pairs where an except block passes exception data on.

    Every handler is scanned, named or not. Known gaps (documented follow-ups):
    interprocedural flow through local helpers and the traceback that
    ``logging.exception`` emits implicitly.
    """
    found: set[tuple[int, str]] = set()
    for handler in ast.walk(ast.parse(source)):
        if not isinstance(handler, ast.ExceptHandler):
            continue
        tainted, sink_aliases = _propagate(handler)
        for statement in handler.body:
            for node in ast.walk(statement):
                if isinstance(node, ast.Return) and node.value is not None:
                    if _is_tainted(node.value, tainted):
                        found.add((node.lineno, "return"))
                    continue
                if not isinstance(node, ast.Call):
                    continue
                if _call_name(node) in EXCEPTION_KEYWORD_SINKS:
                    arguments = _checked_helper_arguments(node, handler.name)
                elif _is_sink_reference(node.func, sink_aliases):
                    arguments = [*node.args, *(keyword.value for keyword in node.keywords)]
                else:
                    continue
                if any(_is_tainted(argument, tainted) for argument in arguments):
                    found.add((node.lineno, _call_name(node)))
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
                error_id = report_error("context", error=e)
                report_error(context="context", error=e)
                await handler.reply_error(1, 2, "context", "Could not do it.", error=e)
                await handler.reply_error(1, 2, "context", summary="Failed.", error=e)
                await CommandHandler.reply_error(handler, 1, 2, "context", "Failed.", error=e)
                await client.send_response({"content": user_error("Failed.", error_id)}, 1, 2)
                return {"content": "Could not do it."}
        """
    )
    assert exception_exposures(source) == []


@pytest.mark.parametrize(
    ("label", "header", "body", "sink"),
    [
        (
            "user_error propagates taint",
            "except Exception as e:",
            'return {"content": user_error(str(e), "id")}',
            "return",
        ),
        (
            "user_error tainted id",
            "except Exception as e:",
            'await client.send_response({"content": user_error("Failed.", repr(e))}, 1, 2)',
            "send_response",
        ),
        (
            "reply_error tainted summary",
            "except Exception as e:",
            'await handler.reply_error(1, 2, "ctx", e, str(e))',
            "reply_error",
        ),
        (
            "reply_error tainted keyword summary",
            "except Exception as e:",
            'await handler.reply_error(1, 2, "ctx", error=e, summary=f"{e}")',
            "reply_error",
        ),
        (
            "reply_error tainted context",
            "except Exception as e:",
            'await handler.reply_error(1, 2, f"ctx {e}", e, "Failed.")',
            "reply_error",
        ),
        (
            "report_error tainted context",
            "except Exception as e:",
            "report_error(str(e), e)",
            "report_error",
        ),
        (
            "format_exc in named handler",
            "except Exception as e:",
            "print(traceback.format_exc())",
            "print",
        ),
        ("format_exc in bare handler", "except:", "print(traceback.format_exc())", "print"),
        (
            "format_exception in typed handler",
            "except ValueError:",
            "return traceback.format_exception(*sys.exc_info())",
            "return",
        ),
        (
            "sys.exc_info subscript",
            "except ValueError:",
            'detail = sys.exc_info()[1]\nreturn {"content": str(detail)}',
            "return",
        ),
        (
            "str of sys.exc_info",
            "except Exception:",
            "logger.error(str(sys.exc_info()[1]))",
            "error",
        ),
        (
            "sys.exception",
            "except Exception:",
            'await client.send_followup(content=f"{sys.exception()}")',
            "send_followup",
        ),
        (
            "starred positional shifts the summary",
            "except Exception as e:",
            'await handler.reply_error(1, 2, *("ctx", RuntimeError("x")), str(e))',
            "reply_error",
        ),
        (
            "double-star kwargs bind the summary",
            "except Exception as e:",
            'await handler.reply_error(1, 2, "ctx", e, **{"summary": str(e)})',
            "reply_error",
        ),
        (
            "double-star kwargs make the slot ambiguous",
            "except Exception as e:",
            'await handler.reply_error(1, 2, "ctx", str(e), **extra)',
            "reply_error",
        ),
        (
            "unbound class call shifts the slot",
            "except Exception as e:",
            'await CommandHandler.reply_error(handler, 1, 2, str(e), RuntimeError("x"), "S")',
            "reply_error",
        ),
        (
            "aliased capitalized instance",
            "except Exception as e:",
            'Handler = handler\nawait Handler.reply_error(1, 2, "ctx", RuntimeError("x"), str(e))',
            "reply_error",
        ),
        (
            "lowercase class alias",
            "except Exception as e:",
            (
                "cls = CommandHandler\n"
                'await cls.reply_error(handler, 1, 2, str(e), RuntimeError("x"), "S")'
            ),
            "reply_error",
        ),
        (
            "positional exception to report_error",
            "except Exception as e:",
            'report_error("ctx", e)',
            "report_error",
        ),
        (
            "positional exception to reply_error",
            "except Exception as e:",
            'await handler.reply_error(1, 2, "ctx", "Failed.", e)',
            "reply_error",
        ),
        (
            "aliased exception keyword",
            "except Exception as e:",
            'err = e\nreport_error("ctx", error=err)',
            "report_error",
        ),
        (
            "derived exception keyword",
            "except Exception as e:",
            'report_error("ctx", error=str(e))',
            "report_error",
        ),
        (
            "imported format_exc",
            "except Exception:",
            "text = format_exc()\nprint(text)",
            "print",
        ),
    ],
)
def test_guard_checks_helper_arguments_and_implicit_sources(
    label: str, header: str, body: str, sink: str
) -> None:
    source = "async def h(client, handler, logger):\n    try:\n        pass\n    " + header + "\n"
    source += textwrap.indent(body, "        ") + "\n"
    assert [found for _line, found in exception_exposures(source)] == [sink], label


def test_guard_exempts_only_the_bound_exception_keyword() -> None:
    source = textwrap.dedent(
        """
        async def h(handler):
            try:
                pass
            except Exception as e:
                report_error("ctx", error=e)
                await handler.reply_error(1, 2, "ctx", "Failed.", error=e)
            try:
                pass
            except Exception:
                report_error("ctx", error=sys.exception())
        """
    )
    assert exception_exposures(source) == []


@pytest.mark.parametrize("filename", GUARDED_FILES)
def test_handlers_do_not_expose_exception_text(filename: str) -> None:
    source = (DISCORD_DIR / filename).read_text(encoding="utf-8")
    assert exception_exposures(source) == [], filename


def test_report_error_logs_one_escaped_line_with_correlation_id(caplog) -> None:
    caplog.set_level(logging.ERROR, logger="error_reporting")
    try:
        raise RuntimeError(f"line one\r\n[forged] {SYNTHETIC_DETAIL}\x1b[31m")
    except RuntimeError as error:
        error_id = report_error("unit test\ncontext", error=error)

    record = caplog.records[-1]
    message = record.getMessage()
    assert record.name == "error_reporting"
    assert record.levelno == logging.ERROR
    assert "\r" not in message
    assert "\n" not in message
    assert "\x1b" not in message
    prefix = f"🤖: unit test\\ncontext failed [error_id={error_id}] RuntimeError: "
    assert message.startswith(prefix)
    assert len(error_id) == 8


def test_user_error_never_contains_exception_text() -> None:
    message = user_error("Could not load lists.", "abcd1234")
    assert message == (
        "❌ **Error:** Could not load lists. Please try again. (Error ID: `abcd1234`)"
    )


def test_reply_error_sends_fixed_text_with_correlation_id(caplog) -> None:
    caplog.set_level(logging.ERROR, logger="error_reporting")
    sent: list[dict] = []

    class RecordingClient:
        async def send_response(self, data: dict, _app_id: str, _token: str) -> None:
            sent.append(data)

    handler = CommandHandler.__new__(CommandHandler)
    handler.discord_client = RecordingClient()

    asyncio.run(
        handler.reply_error(
            "app", "token", "lists command", "Failed.", error=RuntimeError(SYNTHETIC_DETAIL)
        )
    )

    content = sent[0]["content"]
    assert SYNTHETIC_DETAIL not in content
    assert content.startswith("❌ **Error:** Failed. Please try again. (Error ID: `")
    error_id = content.rsplit("`", 2)[1]
    message = caplog.records[-1].getMessage()
    assert f"[error_id={error_id}]" in message
    assert "\r" not in message
    assert "\n" not in message


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
