"""Source-only regressions for the Finance artifact wrapper."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("finance_artifact", HERE / "finance-native-artifact.py")
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
os.environ.pop(wrapper.PROFILE_ENV, None)
artifact = wrapper.load()
production = wrapper.load("production")
base_spec = importlib.util.spec_from_file_location("apps_artifact", HERE / "apps-native-artifact.py")
base = importlib.util.module_from_spec(base_spec)
base_spec.loader.exec_module(base)
SHA = "b" * 40
WORKER = "tuturuuu-finance-vite-staging"
PRODUCTION_WORKER = "tuturuuu-finance"


class FinanceArtifactTest(unittest.TestCase):
    def fixture(self, module=None):
        module = module or artifact
        temporary = tempfile.TemporaryDirectory(prefix="finance-output-fixture-")
        self.addCleanup(temporary.cleanup)
        app = Path(temporary.name)
        for directory in ("dist/native", "dist/client/assets", ".wrangler/deploy", "public"):
            (app / directory).mkdir(parents=True)
        for name in wrapper.PUBLIC_FILES:
            (app / "public" / name).parent.mkdir(parents=True, exist_ok=True)
            (app / "dist/client" / name).parent.mkdir(parents=True, exist_ok=True)
            (app / "public" / name).write_bytes(b"source " + name.encode())
            (app / "dist/client" / name).write_bytes(b"source " + name.encode())
        selected = next(v for v in wrapper.PROFILES.values() if v["workerName"] == module.IDENTITY["name"])
        (app / "dist/client/assets/entry.js").write_text(
            "export const hydrated = true;"
            + json.dumps([selected["vars"]["NEXT_PUBLIC_SUPABASE_URL"], selected["vars"]["NEXT_PUBLIC_WEB_APP_URL"]])
        )
        (app / "dist/native/index.js").write_text("export default {fetch(){return new Response('fixture')}}")
        config = {
            **module.IDENTITY, **module.NORMALIZED_DEFAULTS,
            "configPath": str(app / ".void-wrangler.jsonc"), "userConfigPath": str(app / ".void-wrangler.jsonc"),
            "main": "index.js",
            "assets": {"binding": "ASSETS", "directory": "../client", "run_worker_first": True, "not_found_handling": "none"},
        }
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        (app / base.REDIRECT).write_text(json.dumps({"configPath": "../../dist/native/wrangler.json", "auxiliaryWorkers": []}))
        return app, config

    def test_identity_is_finance_and_base_module_is_untouched(self):
        self.assertIn("robots.txt", wrapper.PUBLIC_FILES)
        self.assertEqual(artifact.IDENTITY["name"], WORKER)
        self.assertIs(artifact.IDENTITY["workers_dev"], False)
        self.assertIs(base.IDENTITY["workers_dev"], True)
        self.assertEqual(artifact.NORMALIZED_DEFAULTS["topLevelName"], WORKER)
        self.assertEqual(artifact.IDENTITY["vars"], {
            "TUTURUUU_NOINDEX": "1",
            "INTERNAL_WEB_API_ORIGIN": "https://staging.tuturuuu.com",
            "NEXT_PUBLIC_WEB_APP_URL": "https://staging.tuturuuu.com",
            "NEXT_PUBLIC_APP_URL": "https://finance-staging.tuturuuu.com",
            "FINANCE_APP_URL": "https://finance-staging.tuturuuu.com",
            "NEXT_PUBLIC_SUPABASE_URL": "https://fxefojytwimjiqxseqag.supabase.co",
        })
        self.assertEqual(artifact.IDENTITY["compatibility_flags"], ["nodejs_compat", "global_fetch_strictly_public"])
        self.assertEqual(base.IDENTITY["compatibility_flags"], ["nodejs_compat"])
        self.assertEqual(base.IDENTITY["name"], "tuturuuu-apps-vite-staging")
        self.assertEqual(base.PUBLIC_FILES, ("robots.txt", "sitemap.xml"))

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

    def test_rejects_workers_dev_for_root_only_artifact(self):
        app, config = self.fixture()
        config["workers_dev"] = True
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, "contract drift: workers_dev"):
            artifact.validate_output(app)

    def test_cli_requires_the_finance_source_channel(self):
        app, _ = self.fixture()
        env = {k: v for k, v in os.environ.items() if k not in ("APPS_SOURCE_SHA", "FINANCE_SOURCE_SHA")}
        env["APPS_SOURCE_SHA"] = SHA
        receipt = app / "receipt.json"
        failed = subprocess.run([sys.executable, str(HERE / "finance-native-artifact.py"), "seal", str(app), "--receipt", str(receipt)], env=env, capture_output=True)
        self.assertNotEqual(failed.returncode, 0)
        env["FINANCE_SOURCE_SHA"] = SHA
        subprocess.run([sys.executable, str(HERE / "finance-native-artifact.py"), "seal", str(app), "--receipt", str(receipt)], env=env, check=True)
        self.assertEqual(json.loads(receipt.read_text())["sourceSha"], SHA)

    def test_production_profile_identity(self):
        self.assertEqual(production.IDENTITY["name"], PRODUCTION_WORKER)
        self.assertEqual(production.NORMALIZED_DEFAULTS["topLevelName"], PRODUCTION_WORKER)
        self.assertIs(production.IDENTITY["workers_dev"], False)
        self.assertEqual(production.IDENTITY["compatibility_flags"], ["nodejs_compat", "global_fetch_strictly_public"])
        self.assertEqual(production.IDENTITY["vars"], {
            "INTERNAL_WEB_API_ORIGIN": "https://tuturuuu.com",
            "NEXT_PUBLIC_WEB_APP_URL": "https://tuturuuu.com",
            "NEXT_PUBLIC_APP_URL": "https://finance.tuturuuu.com",
            "FINANCE_APP_URL": "https://finance.tuturuuu.com",
            "NEXT_PUBLIC_SUPABASE_URL": "https://nzamlzqfdwaaxdefwraj.supabase.co",
        })
        self.assertEqual(wrapper.PROFILES["staging"]["rootHost"], "finance-staging.tuturuuu.com")
        self.assertEqual(wrapper.PROFILES["production"]["rootHost"], "finance.tuturuuu.com")
        self.assertEqual(set(wrapper.PROFILES), {"staging", "production"})
        with self.assertRaisesRegex(ValueError, "unknown VITE_FINANCE_NATIVE_PROFILE"):
            wrapper.load("prod")

    def test_profiles_reject_each_others_output(self):
        for sealed, other, worker in ((artifact, production, PRODUCTION_WORKER), (production, artifact, WORKER)):
            with self.subTest(worker=worker):
                app, config = self.fixture(other)
                with self.assertRaisesRegex(ValueError, "contract drift: (name|topLevelName|vars)"):
                    sealed.validate_output(app)
                for key in ("name", "topLevelName"):
                    config[key] = sealed.IDENTITY["name"]
                (app / "dist/native/wrangler.json").write_text(json.dumps(config))
                with self.assertRaisesRegex(ValueError, "contract drift: vars"):
                    sealed.validate_output(app)

    def test_profile_receipts_are_not_interchangeable(self):
        app, _ = self.fixture(production)
        receipt = production.artifact(app, SHA)
        self.assertEqual(receipt["worker"], PRODUCTION_WORKER)
        production.verify(app, receipt, SHA)
        with self.assertRaisesRegex(ValueError, "contract drift"):
            artifact.verify(app, receipt, SHA)

    def test_routes_are_flip_time_actions_not_config(self):
        for module in (artifact, production):
            app, config = self.fixture(module)
            (app / "dist/native/wrangler.json").write_text(json.dumps({**config, "routes": [{"pattern": "finance.tuturuuu.com/*", "zone_name": "tuturuuu.com"}]}))
            with self.assertRaisesRegex(ValueError, "unreviewed emitted config field"):
                module.validate_output(app)

    def test_cli_selects_the_production_profile_explicitly(self):
        app, _ = self.fixture(production)
        env = {k: v for k, v in os.environ.items() if k not in ("APPS_SOURCE_SHA", wrapper.PROFILE_ENV)}
        env["FINANCE_SOURCE_SHA"] = SHA
        receipt = app / "receipt.json"
        staging = subprocess.run([sys.executable, str(HERE / "finance-native-artifact.py"), "seal", str(app), "--receipt", str(receipt)], env=env, capture_output=True)
        self.assertNotEqual(staging.returncode, 0)
        env[wrapper.PROFILE_ENV] = "production"
        subprocess.run([sys.executable, str(HERE / "finance-native-artifact.py"), "seal", str(app), "--receipt", str(receipt)], env=env, check=True)
        self.assertEqual(json.loads(receipt.read_text())["worker"], PRODUCTION_WORKER)

    def test_bundles_carry_only_their_profile_values(self):
        cases = (
            (production, "client/assets/entry.js", "https://fxefojytwimjiqxseqag.supabase.co"),
            (production, "native/chunk.js", "https://staging.tuturuuu.com"),
            (production, "client/assets/entry.js", "finance-staging.tuturuuu.com"),
            (artifact, "native/chunk.js", "https://nzamlzqfdwaaxdefwraj.supabase.co"),
        )
        for module, name, value in cases:
            with self.subTest(worker=module.IDENTITY["name"], value=value):
                app, _ = self.fixture(module)
                target = app / "dist" / name
                target.write_text(target.read_text() + value if target.exists() else value)
                with self.assertRaisesRegex(ValueError, "other profile's value"):
                    module.validate_output(app)

    def test_browser_bundle_must_carry_the_profile_values(self):
        app, _ = self.fixture(production)
        (app / "dist/client/assets/entry.js").write_text("export const hydrated = true")
        with self.assertRaisesRegex(ValueError, "browser bundle lacks its profile values"):
            production.validate_output(app)

    def test_rejects_the_development_coordination_secret(self):
        app, _ = self.fixture(production)
        (app / "dist/native/index.js").write_text("const s = 'tuturuuu-local-development-app-coordination-secret'")
        with self.assertRaisesRegex(ValueError, "development coordination secret"):
            production.validate_output(app)
        (app / "dist/native/index.js").write_text("export default {}")
        (app / "dist/native/index.js.map").write_text('{"sourcesContent":["tuturuuu-local-development-app-coordination-secret fxefojytwimjiqxseqag"]}')
        production.validate_output(app)


if __name__ == "__main__":
    unittest.main()
