"""Launch real manifests from outside the plugin using pinned Codex path rules.

This is a contract/stdio test, not an execution of the Rust Codex loader. Source:
openai/codex d2b254fd17ced848dbc269705373cf5a02ed3284 codex-mcp/src/
agent_plugin_config.rs (contained cwd), plugin_config.rs (root.join(cwd)).
"""
import asyncio
import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
GATE = 'TUTURUUU_MCP_READS_ENABLED'


class ManifestTests(unittest.TestCase):
    tool = "list_workspaces"
    arguments = {}
    def parameters(self, portable):
        from mcp import StdioServerParameters
        manifest = ROOT / ('mcp.json' if portable else '.mcp.json')
        server = json.loads(manifest.read_text())['mcpServers']['tuturuuu-readonly']
        self.assertEqual(server['command'], 'python3')
        self.assertEqual(server['cwd'], './')
        self.assertEqual(server['args'], ['mcp/server.py'])
        self.assertNotIn('env', server)
        if portable:
            self.assertEqual(server['type'], 'stdio')
            self.assertNotIn('env_vars', server)  # schema rejects that field
        else:
            overlay = json.loads((ROOT / '.codex-plugin/plugin.json').read_text())
            self.assertEqual(overlay['mcpServers'], './.mcp.json')
            self.assertEqual(server['env_vars'], [GATE])
        # Codex default environment filtering + explicit legacy forwarding.
        env = {name: os.environ[name] for name in server.get('env_vars', [])
               if name in os.environ}
        # Substitute only the reviewed test interpreter, never script/path/env.
        return StdioServerParameters(command=sys.executable, args=server['args'],
                                     cwd=str(ROOT / server['cwd']), env=env)

    def call(self, parameters):
        from mcp import ClientSession
        from mcp.client.stdio import stdio_client
        async def verify():
            async with stdio_client(parameters) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    return await session.call_tool(self.tool, self.arguments)
        return asyncio.run(verify())

    def test_manifest_gate_omitted_and_disabled(self):
        with patch.dict(os.environ, {}, clear=True):
            for portable in (False, True):
                result = self.call(self.parameters(portable))
                self.assertFalse(bool(result.isError))
                self.assertEqual(result.structuredContent, {"workspaces": []})

    def test_legacy_explicit_opt_in_forwarded_without_credentials(self):
        with patch.dict(os.environ, {GATE: '1', 'UNRELATED_SECRET': 'do-not-forward'}, clear=True):
            parameters = self.parameters(False)
            self.assertEqual(parameters.env, {GATE: '1'})
            # Empty PATH from the SDK's default env means CLI is unavailable;
            # reaching that error proves the gate received the opt-in value.
            parameters.env['PATH'] = '/nonexistent'
            self.tool = 'list_workspace_tasks'
            self.arguments = {'workspace_id': '00000000-0000-4000-8000-000000000001'}
            result = self.call(parameters)
            self.assertTrue(result.isError)
            self.assertIn('unavailable', result.content[0].text)

    def test_portable_cannot_silently_enable_reads(self):
        with patch.dict(os.environ, {GATE: '1'}, clear=True):
            result = self.call(self.parameters(True))
            self.assertFalse(bool(result.isError))
            self.assertEqual(result.structuredContent, {"workspaces": []})
