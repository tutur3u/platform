"""Source-only seal/restore checks; fixtures are not emitted build evidence."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).parent
SCRIPT = HERE / "nova-inventory-native-artifact.py"
spec = importlib.util.spec_from_file_location("nova_inventory_artifact", SCRIPT)
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
SHA = "c" * 40


class ArtifactTest(unittest.TestCase):
    def fixture(self, name):
        artifact = wrapper.load(name)
        temporary = tempfile.TemporaryDirectory(prefix=f"{name}-artifact-fixture-")
        self.addCleanup(temporary.cleanup)
        app = Path(temporary.name)
        for directory in ("dist/native", "dist/client/assets", ".wrangler/deploy", "public"):
            (app / directory).mkdir(parents=True)
        for file in artifact.PUBLIC_FILES:
            for base in (app / "public", app / "dist/client"):
                target = base / file
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(file.encode())
        (app / "dist/native/index.js").write_text("export default {fetch(){}}")
        (app / "dist/client/assets/entry.js").write_text("export const fixture = true")
        config = {
            **artifact.IDENTITY, **artifact.NORMALIZED_DEFAULTS,
            "configPath": str(app / ".void-wrangler.jsonc"),
            "userConfigPath": str(app / ".void-wrangler.jsonc"),
            "main": "index.js",
            "assets": {
                "binding": "ASSETS", "directory": "../client",
                "run_worker_first": True, "not_found_handling": "none",
            },
        }
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        (app / artifact.REDIRECT).write_text(json.dumps({
            "configPath": "../../dist/native/wrangler.json", "auxiliaryWorkers": [],
        }))
        return artifact, app, config

    def test_both_apps_seal_pack_restore_and_reject_changed_output(self):
        for name in wrapper.APPS:
            with self.subTest(app=name):
                artifact, app, _ = self.fixture(name)
                receipt = artifact.artifact(app, SHA)
                self.assertEqual(receipt["worker"], f"tuturuuu-{name}-vite-staging")
                receipt_path, archive = app / "receipt.json", app / "output.tgz"
                receipt_path.write_text(json.dumps(receipt))
                artifact.pack(app, receipt_path, archive, SHA)
                target = app / "restored"
                (target / "public").mkdir(parents=True)
                for file in artifact.PUBLIC_FILES:
                    path = target / "public" / file
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes((app / "public" / file).read_bytes())
                artifact.restore(target, archive, target / "receipt.json", SHA)
                artifact.verify(target, receipt, SHA)
                (target / "dist/native/index.js").write_text("changed")
                with self.assertRaisesRegex(ValueError, "differs from sealed"):
                    artifact.verify(target, receipt, SHA)

    def test_rejects_another_worker_identity_and_public_asset_drift(self):
        for name in wrapper.APPS:
            with self.subTest(app=name):
                artifact, app, config = self.fixture(name)
                path = app / "dist/native/wrangler.json"
                path.write_text(json.dumps({**config, "name": "tuturuuu-apps-vite-staging"}))
                with self.assertRaisesRegex(ValueError, "contract drift: name"):
                    artifact.artifact(app, SHA)
                path.write_text(json.dumps(config))
                (app / "dist/client" / artifact.PUBLIC_FILES[0]).write_text("changed")
                with self.assertRaisesRegex(ValueError, "public asset drift"):
                    artifact.artifact(app, SHA)

    def test_accepts_canonical_public_fetch_flags_and_rejects_drift(self):
        for name in wrapper.APPS:
            with self.subTest(app=name):
                artifact, app, config = self.fixture(name)
                path = app / "dist/native/wrangler.json"
                config["compatibility_flags"] = [
                    "nodejs_compat", "global_fetch_strictly_public",
                ]
                path.write_text(json.dumps(config))
                artifact.artifact(app, SHA)
                path.write_text(json.dumps({**config, "compatibility_flags": ["nodejs_compat"]}))
                with self.assertRaisesRegex(ValueError, "contract drift: compatibility_flags"):
                    artifact.artifact(app, SHA)

    def test_cli_requires_its_own_exact_source_channel(self):
        for name in wrapper.APPS:
            with self.subTest(app=name):
                _, app, _ = self.fixture(name)
                receipt = app / "receipt.json"
                env = {key: value for key, value in os.environ.items()
                       if key not in ("APPS_SOURCE_SHA", "START_BRIDGE_SOURCE_SHA")}
                env["APPS_SOURCE_SHA"] = SHA
                command = [sys.executable, str(SCRIPT), name, "seal", str(app), "--receipt", str(receipt)]
                result = subprocess.run(command, env=env, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                env["START_BRIDGE_SOURCE_SHA"] = SHA
                subprocess.run(command, env=env, check=True, capture_output=True)
                self.assertEqual(json.loads(receipt.read_text())["sourceSha"], SHA)


if __name__ == "__main__":
    unittest.main()
