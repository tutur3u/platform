"""User-safe error reporting for Discord handlers.

Exception text can carry SQL, schema, provider, URL or file-path details, so
handlers never echo it to Discord users or print it raw. Instead they log a
single escaped line server-side under a short correlation ID and show users
fixed text that includes only that ID.
"""

import secrets
import traceback

MAX_LOGGED_MESSAGE_LENGTH = 500
MAX_LOGGED_FRAMES = 5


def _frame_summary(error: BaseException) -> str:
    frames = traceback.extract_tb(error.__traceback__)[-MAX_LOGGED_FRAMES:]
    return " <- ".join(
        f"{frame.filename.rsplit('/', 1)[-1]}:{frame.lineno} {frame.name}"
        for frame in reversed(frames)
    )


def report_error(context: str, *, error: BaseException) -> str:
    """Log an exception on one escaped line and return its correlation ID."""
    error_id = secrets.token_hex(4)
    # repr() escapes CR/LF and control characters so the message stays on
    # one log line; the message itself is never sent to users.
    message = repr(str(error)[:MAX_LOGGED_MESSAGE_LENGTH])
    context_text = repr(context)[1:-1]
    frames = _frame_summary(error) or "no traceback"
    print(
        f"🤖: {context_text} failed [error_id={error_id}] "
        f"{type(error).__name__}: {message} at {frames}"
    )
    return error_id


def user_error(summary: str, error_id: str) -> str:
    """Fixed user-facing error text that carries only the correlation ID."""
    return f"❌ **Error:** {summary} Please try again. (Error ID: `{error_id}`)"
