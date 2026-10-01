"""Opt-in, local user-session reads. Never use this adapter in a hosted server."""
from __future__ import annotations

import json
import os
import subprocess
import tempfile
from collections.abc import Callable
from typing import Literal
from uuid import UUID

MAX_OUTPUT_BYTES = 1_048_576
READS_ENV = "TUTURUUU_MCP_READS_ENABLED"


class BridgeError(ValueError):
    """Safe, public error; never embed subprocess output or credentials."""


def workspace_uuid(value: str) -> str:
    try:
        normalized = str(UUID(value))
    except (ValueError, TypeError, AttributeError):
        raise BridgeError("Use a workspace UUID returned by list_workspaces.") from None
    if value != normalized:
        raise BridgeError("Use a canonical workspace UUID.")
    return normalized


def run_cli(arguments: list[str]) -> object:
    # The CLI owns tokens, refresh, and API authorization. No shell or model-supplied
    # executable, env, origin, token, config path, or arbitrary CLI flags are accepted.
    if os.environ.get(READS_ENV) != "1":
        raise BridgeError("Local reads are disabled. Enable them only after reviewing the MCP setup guide.")
    with tempfile.TemporaryFile() as output:
        try:
            completed = subprocess.run(
                ["ttr", *arguments, "--json", "--no-update-check"],
                stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.DEVNULL,
                timeout=20, check=False,
            )
        except (OSError, subprocess.TimeoutExpired):
            raise BridgeError("Tuturuuu CLI unavailable or timed out. Check your local CLI session.") from None
        if completed.returncode != 0:
            raise BridgeError("Tuturuuu read failed. Check your local CLI login and workspace access.")
        output.seek(0)
        payload = output.read(MAX_OUTPUT_BYTES + 1)
    if len(payload) > MAX_OUTPUT_BYTES:
        raise BridgeError("Tuturuuu response exceeds the local read limit.")
    try:
        return json.loads(payload)
    except (ValueError, UnicodeDecodeError):
        raise BridgeError("Unsupported CLI response. Update the CLI and retry.") from None


def safe_name(value: object) -> str:
    # Names remain untrusted data, never instructions, URLs, or tool arguments.
    return value[:200] if isinstance(value, str) else ""


class ReadBridge:
    def __init__(self, run: Callable[[list[str]], object] = run_cli):
        self.run = run

    def workspaces(self) -> list[dict]:
        data = self.run(["workspaces", "list"])
        if not isinstance(data, list) or len(data) > 1000:
            raise BridgeError("Unsupported workspace response.")
        result = []
        for row in data:
            if not isinstance(row, dict):
                raise BridgeError("Unsupported workspace response.")
            result.append({"id": workspace_uuid(row.get("id")), "name": safe_name(row.get("name"))})
        return result

    def authorize(self, workspace_id: str) -> str:
        normalized = workspace_uuid(workspace_id)
        if not any(row["id"] == normalized for row in self.workspaces()):
            raise BridgeError("Workspace unavailable to the current CLI user.")
        return normalized

    def tasks(self, workspace_id: str, limit: int = 20, offset: int = 0) -> dict:
        if type(limit) is not int or not 1 <= limit <= 50:
            raise BridgeError("Limit must be an integer from 1 to 50.")
        if type(offset) is not int or not 0 <= offset <= 10000:
            raise BridgeError("Offset must be an integer from 0 to 10000.")
        ws = self.authorize(workspace_id)
        # Explicit workspace disables the CLI's personal/external aggregation.
        data = self.run(["tasks", "list", "--workspace", ws,
                         "--limit", str(limit), "--offset", str(offset)])
        if not isinstance(data, dict) or not isinstance(data.get("tasks"), list):
            raise BridgeError("Unsupported task response.")
        rows = data["tasks"]
        if len(rows) > limit:
            raise BridgeError("Task response exceeds the requested page.")
        tasks = []
        for row in rows:
            if not isinstance(row, dict) or row.get("workspace_id") != ws:
                raise BridgeError("Task response crossed the requested workspace boundary.")
            if row.get("source_workspace_id") not in (None, ws) or row.get("is_personal_external"):
                raise BridgeError("External task placements are excluded from this workspace read.")
            tasks.append({"id": workspace_uuid(row.get("id")), "name": safe_name(row.get("name"))})
        return {"workspace_id": ws, "tasks": tasks, "limit": limit, "offset": offset}

    def navigation(self, workspace_id: str, surface: Literal["tasks", "calendar"]) -> dict:
        if surface not in ("tasks", "calendar"):
            raise BridgeError("Choose tasks or calendar.")
        ws = self.authorize(workspace_id)
        # Links only: no browser launch, event read, mutation, or credentials in URL.
        suffix = "/tasks" if surface == "tasks" else ""
        return {"workspace_id": ws, "surface": surface,
                "url": f"https://{surface}.tuturuuu.com/{ws}{suffix}"}
