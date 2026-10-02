"""Validate packaged read-only MCP identity and wiring without assuming JSON shapes."""
from __future__ import annotations

import json
from pathlib import Path


def fail(message: str) -> None:
    raise SystemExit(message)


def load_object(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        fail(f"Invalid or missing JSON file: {path}")
    if not isinstance(value, dict):
        fail(f"Expected JSON object: {path}")
    return value


def validate_portable_mcp(plugin_root: Path, manifest: dict) -> None:
    portable = load_object(plugin_root / "plugin.json")
    if portable.get("$schema") != "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json":
        fail("portable plugin must declare the Agent Plugins schema")
    for key in ("name", "description", "author", "homepage", "repository", "license", "keywords"):
        if portable.get(key) != manifest.get(key):
            fail(f"portable identity differs from compatibility manifest: {key}")
    # Omitting the inline overlay preserves ALL existing OpenAI interface settings.
    if "extensions" in portable:
        fail("portable plugin currently uses the compatibility OpenAI overlay")
    if manifest.get("mcpServers") != "./.mcp.json":
        fail("compatibility manifest must reference the local MCP config")
    config = load_object(plugin_root / "mcp.json")
    if config.get("$schema") != "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json":
        fail("portable MCP config must declare the Agent Plugins schema")
    fallback = load_object(plugin_root / ".mcp.json")
    servers = config.get("mcpServers", {})
    if not isinstance(servers, dict) or set(servers) != {"tuturuuu-readonly"}:
        fail("only the local read MCP server is supported")
    fallback_servers = fallback.get("mcpServers")
    if not isinstance(fallback_servers, dict) or set(fallback_servers) != {"tuturuuu-readonly"}:
        fail("only the local read MCP compatibility server is supported")
    for name, server in servers.items():
        if not isinstance(server, dict):
            fail("local MCP server must be an object")
        if server.get("type") != "stdio":
            fail("local MCP must use stdio, never unauthenticated HTTP")
        expected = {"command": "python3", "args": ["mcp/server.py"], "cwd": "./"}
        if {key: value for key, value in server.items() if key != "type"} != expected:
            fail("local MCP command must use the packaged server")
        if fallback_servers.get(name) != {**expected, "env_vars": ["TUTURUUU_MCP_READS_ENABLED"]}:
            fail("portable and compatibility MCP wiring differ")
        if not (plugin_root / "mcp" / "server.py").is_file():
            fail("missing local MCP entrypoint")
