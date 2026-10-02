"""Malformed packaged manifests fail with useful filenames, never raw tracebacks."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("portable_mcp", ROOT / "scripts/portable_mcp.py")
WIRING = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(WIRING)


class WiringTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for filename in ("plugin.json", "mcp.json", ".mcp.json"):
            shutil.copyfile(ROOT / filename, self.root / filename)
        (self.root / "mcp").mkdir()
        (self.root / "mcp/server.py").touch()
        self.manifest = json.loads((ROOT / ".codex-plugin/plugin.json").read_text())

    def check(self):
        WIRING.validate_portable_mcp(self.root, self.manifest)

    def test_valid_packaged_wiring_is_accepted(self):
        self.check()

    def test_extra_compatibility_server_is_rejected(self):
        p = self.root / ".mcp.json"
        value = json.loads(p.read_text())
        value["mcpServers"]["extra"] = {"command": "untrusted"}
        p.write_text(json.dumps(value))
        with self.assertRaisesRegex(SystemExit, "compatibility"):
            self.check()

    def test_malformed_missing_and_non_object_json_name_the_file(self):
        for name in ("plugin.json", "mcp.json", ".mcp.json"):
            p = self.root / name
            original = p.read_text()
            for content in ("{bad", "[]", None):
                if content is None:
                    p.unlink()
                else:
                    p.write_text(content)
                with self.assertRaises(SystemExit) as error:
                    self.check()
                self.assertIn(name, str(error.exception))
                p.write_text(original)

    def test_non_object_server_maps_and_entries_fail_cleanly(self):
        p = self.root / "mcp.json"
        original = json.loads(p.read_text())
        for value in (["tuturuuu-readonly"], {"tuturuuu-readonly": None}, {"tuturuuu-readonly": "bad"}):
            p.write_text(json.dumps({**original, "mcpServers": value}))
            with self.assertRaises(SystemExit):
                self.check()


if __name__ == "__main__":
    unittest.main()
