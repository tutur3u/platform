"""Source-only regressions for the Tasks artifact wrapper."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("tasks_artifact", HERE / "tasks-native-artifact.py")
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
artifact = wrapper.load()
base_spec = importlib.util.spec_from_file_location("apps_artifact", HERE / "apps-native-artifact.py")
base = importlib.util.module_from_spec(base_spec)
base_spec.loader.exec_module(base)
SHA = "b" * 40
WORKER = "tuturuuu-tasks-vite-staging"


class TasksArtifactTest(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory(prefix="tasks-output-fixture-")
        self.addCleanup(temporary.cleanup)
        app = Path(temporary.name)
        for directory in ("dist/native", "dist/client/assets", ".wrangler/deploy", "public"):
            (app / directory).mkdir(parents=True)
        for name in wrapper.PUBLIC_FILES:
            (app / "public" / name).parent.mkdir(parents=True, exist_ok=True)
            (app / "dist/client" / name).parent.mkdir(parents=True, exist_ok=True)
            (app / "public" / name).write_bytes(b"source " + name.encode())
            (app / "dist/client" / name).write_bytes(b"source " + name.encode())
        (app / "dist/client/assets/entry.js").write_text("export const hydrated = true")
        (app / "dist/native/index.js").write_text("export default {fetch(){return new Response('fixture')}}")
        config = {
            **artifact.IDENTITY, **artifact.NORMALIZED_DEFAULTS,
            "configPath": str(app / ".void-wrangler.jsonc"), "userConfigPath": str(app / ".void-wrangler.jsonc"),
            "main": "index.js",
            "assets": {"binding": "ASSETS", "directory": "../client", "run_worker_first": True, "not_found_handling": "none", "html_handling": "none"},
        }
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        (app / base.REDIRECT).write_text(json.dumps({"configPath": "../../dist/native/wrangler.json", "auxiliaryWorkers": []}))
        return app, config

    def test_identity_is_the_declared_tasks_worker(self):
        self.assertIn("robots.txt", wrapper.PUBLIC_FILES)
        self.assertIn("offline.html", wrapper.PUBLIC_FILES)
        self.assertEqual(artifact.PUBLIC_HTML, ("offline.html",))
        self.assertEqual(base.PUBLIC_HTML, ())
        self.assertEqual(artifact.IDENTITY["name"], WORKER)
        self.assertEqual(artifact.NORMALIZED_DEFAULTS["topLevelName"], WORKER)
        self.assertEqual(artifact.IDENTITY["compatibility_date"], "2026-10-19")
        self.assertEqual(artifact.IDENTITY["compatibility_flags"], ["nodejs_compat", "global_fetch_strictly_public"])
        self.assertIs(artifact.IDENTITY["workers_dev"], False)
        self.assertEqual(artifact.IDENTITY["vars"], {})
        self.assertNotIn("observability", artifact.IDENTITY)
        self.assertEqual(artifact.ASSET_POLICY["html_handling"], "none")
        self.assertNotIn("html_handling", base.ASSET_POLICY)
        self.assertEqual(artifact.RECEIPT, "tasks-native-artifact.json")
        self.assertEqual(base.IDENTITY["name"], "tuturuuu-apps-vite-staging")
        self.assertIn("observability", base.IDENTITY)
        self.assertEqual(base.PUBLIC_FILES, ("robots.txt", "sitemap.xml"))

    def test_source_config_declares_the_same_identity(self):
        source = (HERE.parents[1] / "apps/tasks/void.config.ts").read_text()
        self.assertIn(f"name: '{WORKER}'", source)
        self.assertIn("compatibility_date: '2026-10-19'", source)
        self.assertIn("compatibility_flags: ['nodejs_compat', 'global_fetch_strictly_public']", source)
        self.assertIn("workers_dev: false", source)
        self.assertIn("html_handling: 'none'", source)
        self.assertNotIn("observability", source)
        self.assertNotIn("vars:", source)

    def test_seal_pack_restore_round_trip(self):
        app, _ = self.fixture()
        receipt = artifact.artifact(app, SHA)
        self.assertEqual(receipt["worker"], WORKER)
        receipt_path, archive = app / "receipt.json", app / "artifact.tar.gz"
        receipt_path.write_text(json.dumps(receipt))
        artifact.pack(app, receipt_path, archive, SHA)
        target = app / "fresh"
        (target / "public").mkdir(parents=True)
        for name in wrapper.PUBLIC_FILES:
            (target / "public" / name).parent.mkdir(parents=True, exist_ok=True)
            (target / "public" / name).write_bytes((app / "public" / name).read_bytes())
        artifact.restore(target, archive, app / "restored.json", SHA)
        artifact.verify(target, receipt, SHA)

    def test_rejects_identity_drift_public_drift_and_prerender_html(self):
        app, config = self.fixture()
        for drift in (
            {"name": "tuturuuu-apps-vite-staging"},
            {"workers_dev": True},
            {"vars": {"TUTURUUU_NOINDEX": "1"}},
            {"compatibility_flags": ["nodejs_compat"]},
            {"observability": {"enabled": True, "head_sampling_rate": 0.05}},
        ):
            (app / "dist/native/wrangler.json").write_text(json.dumps({**config, **drift}))
            with self.assertRaises(ValueError):
                artifact.validate_output(app)
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        artifact.validate_output(app)
        (app / "dist/client/favicon.ico").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "public asset drift: favicon.ico"):
            artifact.validate_output(app)
        (app / "dist/client/favicon.ico").write_bytes(b"source favicon.ico")
        (app / "dist/client/index.html").write_text("<html></html>")
        with self.assertRaisesRegex(ValueError, "unreviewed static HTML"):
            artifact.validate_output(app)
        (app / "dist/client/index.html").unlink()
        # Even a byte-checked public HTML file needs the explicit admission.
        for root in ("public", "dist/client"):
            (app / root / "promo.html").write_text("<html>promo</html>")
        with mock.patch.object(artifact, "PUBLIC_FILES", (*artifact.PUBLIC_FILES, "promo.html")):
            with self.assertRaisesRegex(ValueError, "unreviewed static HTML"):
                artifact.validate_output(app)

    def test_offline_fallback_requires_exact_html_handling(self):
        app, config = self.fixture()
        artifact.validate_output(app)
        missing = {k: v for k, v in config["assets"].items() if k != "html_handling"}
        cases = [
            (missing, "unreviewed asset configuration"),
            ({**config["assets"], "html_handling": "auto-trailing-slash"}, "static bypass/fallback forbidden"),
            ({**config["assets"], "html_handling": "force-trailing-slash"}, "static bypass/fallback forbidden"),
            ({**config["assets"], "html_handling": "drop-trailing-slash"}, "static bypass/fallback forbidden"),
            ({**config["assets"], "html_handling": None}, "static bypass/fallback forbidden"),
            ({**config["assets"], "serve_directly": True}, "unreviewed asset configuration"),
        ]
        for assets, message in cases:
            with self.subTest(assets=assets):
                (app / "dist/native/wrangler.json").write_text(json.dumps({**config, "assets": assets}))
                with self.assertRaisesRegex(ValueError, message):
                    artifact.validate_output(app)

    def test_cli_requires_the_tasks_source_channel(self):
        app, _ = self.fixture()
        env = {k: v for k, v in os.environ.items() if k not in ("APPS_SOURCE_SHA", "TASKS_SOURCE_SHA")}
        env["APPS_SOURCE_SHA"] = SHA
        receipt = app / "receipt.json"
        failed = subprocess.run([sys.executable, str(HERE / "tasks-native-artifact.py"), "seal", str(app), "--receipt", str(receipt)], env=env, capture_output=True)
        self.assertNotEqual(failed.returncode, 0)
        env["TASKS_SOURCE_SHA"] = SHA
        subprocess.run([sys.executable, str(HERE / "tasks-native-artifact.py"), "seal", str(app), "--receipt", str(receipt)], env=env, check=True)
        self.assertEqual(json.loads(receipt.read_text())["sourceSha"], SHA)


if __name__ == "__main__":
    unittest.main()
