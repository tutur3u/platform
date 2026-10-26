"""Source-only regressions for the Pay artifact wrapper."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("pay_artifact", HERE / "pay-native-artifact.py")
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
artifact = wrapper.load()
base_spec = importlib.util.spec_from_file_location("apps_artifact", HERE / "apps-native-artifact.py")
base = importlib.util.module_from_spec(base_spec)
base_spec.loader.exec_module(base)
SHA = "b" * 40
WORKER = "tuturuuu-pay-vite-staging"


class PayArtifactTest(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory(prefix="pay-output-fixture-")
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
            "assets": {"binding": "ASSETS", "directory": "../client", "run_worker_first": True, "not_found_handling": "none"},
        }
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        (app / base.REDIRECT).write_text(json.dumps({"configPath": "../../dist/native/wrangler.json", "auxiliaryWorkers": []}))
        return app, config

    def test_identity_is_pay_and_base_module_is_untouched(self):
        self.assertIn("robots.txt", wrapper.PUBLIC_FILES)
        self.assertEqual(artifact.IDENTITY["name"], WORKER)
        self.assertEqual(artifact.NORMALIZED_DEFAULTS["topLevelName"], WORKER)
        self.assertEqual(artifact.IDENTITY["vars"]["INTERNAL_WEB_API_ORIGIN"], "https://staging.tuturuuu.com")
        self.assertEqual(artifact.IDENTITY["vars"]["NEXT_PUBLIC_WEB_APP_URL"], "https://staging.tuturuuu.com")
        self.assertEqual(artifact.IDENTITY["vars"]["PAY_APP_URL"], "https://pay-staging.tuturuuu.com")
        self.assertEqual(artifact.IDENTITY["vars"]["NEXT_PUBLIC_SUPABASE_URL"], "https://fxefojytwimjiqxseqag.supabase.co")
        self.assertEqual(artifact.IDENTITY["compatibility_flags"], ["nodejs_compat", "global_fetch_strictly_public"])
        self.assertEqual(base.IDENTITY["compatibility_flags"], ["nodejs_compat"])
        self.assertEqual(base.IDENTITY["name"], "tuturuuu-apps-vite-staging")
        self.assertEqual(base.PUBLIC_FILES, ("robots.txt", "sitemap.xml"))

    def test_staging_helper_refuses_live_provider_mode(self):
        with tempfile.TemporaryDirectory() as temporary:
            profile = Path(temporary) / 'profile.json'
            for flag in ('false', None):
                payload = json.loads(wrapper.PROFILE.read_text())
                if flag is None:
                    payload.pop('POLAR_SANDBOX')
                else:
                    payload['POLAR_SANDBOX'] = flag
                profile.write_text(json.dumps(payload))
                with patch.object(wrapper, 'PROFILE', profile):
                    with self.assertRaisesRegex(RuntimeError, 'requires Polar sandbox'):
                        wrapper.load()

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

    def test_rejects_apps_identity_public_drift_and_html(self):
        app, config = self.fixture()
        (app / "dist/native/wrangler.json").write_text(json.dumps({**config, "name": "tuturuuu-apps-vite-staging"}))
        with self.assertRaisesRegex(ValueError, "contract drift: name"):
            artifact.validate_output(app)
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        (app / "dist/client/favicon.ico").write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "public asset drift: favicon.ico"):
            artifact.validate_output(app)
        (app / "dist/client/favicon.ico").write_bytes(b"source favicon.ico")
        (app / "dist/client/index.html").write_text("<html></html>")
        with self.assertRaisesRegex(ValueError, "unreviewed static HTML"):
            artifact.validate_output(app)

    def test_cli_requires_the_pay_source_channel(self):
        app, _ = self.fixture()
        env = {k: v for k, v in os.environ.items() if k not in ("APPS_SOURCE_SHA", "PAY_SOURCE_SHA")}
        env["APPS_SOURCE_SHA"] = SHA
        receipt = app / "receipt.json"
        failed = subprocess.run([sys.executable, str(HERE / "pay-native-artifact.py"), "seal", str(app), "--receipt", str(receipt)], env=env, capture_output=True)
        self.assertNotEqual(failed.returncode, 0)
        env["PAY_SOURCE_SHA"] = SHA
        subprocess.run([sys.executable, str(HERE / "pay-native-artifact.py"), "seal", str(app), "--receipt", str(receipt)], env=env, check=True)
        self.assertEqual(json.loads(receipt.read_text())["sourceSha"], SHA)


if __name__ == "__main__":
    unittest.main()
