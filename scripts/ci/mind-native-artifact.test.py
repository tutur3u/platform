"""The mind seal accepts only the service bindings void.config.ts declares."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("mind_artifact", HERE / "mind-native-artifact.py")
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
artifact = wrapper.load()
base_spec = importlib.util.spec_from_file_location("apps_artifact_for_mind", HERE / "apps-native-artifact.py")
base = importlib.util.module_from_spec(base_spec)
base_spec.loader.exec_module(base)
EXACT = [
    {"binding": "WORKER_SELF_REFERENCE", "service": "tuturuuu-mind"},
    {
        "binding": "ABUSE_GUARD",
        "service": "tuturuuu-abuse-guard",
        "entrypoint": "AbuseGuardEntrypoint",
    },
]


class MindServiceSealTest(unittest.TestCase):
    def fixture(self, services, artifact=artifact, drop=(), patch=None):
        temporary = tempfile.TemporaryDirectory(prefix="mind-output-fixture-")
        self.addCleanup(temporary.cleanup)
        app = Path(temporary.name)
        for directory in ("dist/native", "dist/client", ".wrangler/deploy", "public"):
            (app / directory).mkdir(parents=True)
        for name in wrapper.PUBLIC_FILES:
            (app / "public" / name).write_bytes(b"source " + name.encode())
            target = app / "dist/client" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(b"source " + name.encode())
        (app / "dist/native/index.js").write_text("export default {fetch(){return new Response('fixture')}}")
        config = {
            **artifact.IDENTITY,
            **artifact.NORMALIZED_DEFAULTS,
            "services": services,
            "configPath": str(app / ".void-wrangler.jsonc"),
            "userConfigPath": str(app / ".void-wrangler.jsonc"),
            "main": "index.js",
            "assets": {
                "binding": "ASSETS",
                "directory": "../client",
                "run_worker_first": True,
                "not_found_handling": "none",
            },
        }
        for key in drop:
            config.pop(key, None)
        config.update(patch or {})
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        (app / base.REDIRECT).write_text(json.dumps({
            "configPath": "../../dist/native/wrangler.json",
            "auxiliaryWorkers": [],
        }))
        return app

    def test_exact_declared_services_pass(self):
        self.assertEqual(base.NORMALIZED_DEFAULTS["services"], [])
        self.assertEqual(artifact.NORMALIZED_DEFAULTS["services"], EXACT)
        source = (HERE.parents[1] / "apps/mind/void.config.ts").read_text()
        self.assertIn("binding: 'WORKER_SELF_REFERENCE'", source)
        self.assertIn("service: 'tuturuuu-mind'", source)
        self.assertIn("binding: 'ABUSE_GUARD'", source)
        self.assertIn("service: 'tuturuuu-abuse-guard'", source)
        self.assertIn("entrypoint: 'AbuseGuardEntrypoint'", source)
        artifact.validate_output(self.fixture(json.loads(json.dumps(EXACT))))

    def test_missing_extra_and_renamed_services_are_rejected(self):
        self_reference, abuse_guard = EXACT
        cases = [
            [],
            [self_reference],
            [abuse_guard],
            [*EXACT, {"binding": "OTHER", "service": "other"}],
            [{**self_reference, "binding": "RENAMED"}, abuse_guard],
            [self_reference, {**abuse_guard, "service": "tuturuuu-other"}],
            [self_reference, {**abuse_guard, "entrypoint": "OtherEntrypoint"}],
            [self_reference, {k: v for k, v in abuse_guard.items() if k != "entrypoint"}],
            [{**self_reference, "entrypoint": "AbuseGuardEntrypoint"}, abuse_guard],
            [abuse_guard, self_reference],
        ]
        for services in cases:
            with self.subTest(services=services):
                with self.assertRaisesRegex(ValueError, "contract drift: services"):
                    artifact.validate_output(self.fixture(services))


class MindProductionCutoverTest(MindServiceSealTest):
    """The cutover profile seals what the workflow rewrite emits, nothing else."""

    production = wrapper.load("production")
    WORKER = "tuturuuu-mind"

    def cutover(self, **kwargs):
        return self.fixture(json.loads(json.dumps(self.production.NORMALIZED_DEFAULTS["services"])), artifact=self.production, **kwargs)

    def test_production_profile_pins_worker_receipt_and_vars(self):
        self.assertEqual(self.production.IDENTITY["name"], self.WORKER)
        self.assertEqual(self.production.NORMALIZED_DEFAULTS["topLevelName"], self.WORKER)
        self.assertFalse(self.production.IDENTITY["workers_dev"])
        self.assertFalse(self.production.NORMALIZED_DEFAULTS["preview_urls"])
        self.assertFalse(self.production.NORMALIZED_DEFAULTS["upload_source_maps"])
        self.assertEqual(self.production.RECEIPT, "mind-production-artifact.json")
        self.assertEqual(self.production.IDENTITY["vars"], {
            "TUTURUUU_NOINDEX": "0",
            "NODE_ENV": "production",
            "TUTURUUU_REQUIRE_SECRETS": "1",
            "NEXT_PUBLIC_APP_URL": "https://mind.tuturuuu.com",
            "NEXT_PUBLIC_WEB_APP_URL": "https://tuturuuu.com",
        })
        self.assertEqual(self.production.NORMALIZED_DEFAULTS["services"], artifact.NORMALIZED_DEFAULTS["services"])

    def test_rewritten_production_output_passes(self):
        self.production.validate_output(self.cutover())

    def test_rewrite_that_deletes_emitted_fields_is_rejected(self):
        for key in ("configPath", "userConfigPath", "topLevelName", "definedEnvironments"):
            with self.subTest(key=key):
                with self.assertRaisesRegex(ValueError, "missing normalized output field|unreviewed producer config"):
                    self.production.validate_output(self.cutover(drop=(key,)))

    def test_missing_extra_and_renamed_production_values_are_rejected(self):
        vars_ = self.production.IDENTITY["vars"]
        cases = {
            "worker renamed": {"name": self.WORKER + "-vite-staging"},
            "topLevelName renamed": {"topLevelName": self.WORKER + "-vite-staging"},
            "staging vars": {"vars": {"TUTURUUU_NOINDEX": "1"}},
            "missing var": {"vars": {k: v for k, v in vars_.items() if k != "TUTURUUU_REQUIRE_SECRETS"}},
            "extra var": {"vars": {**vars_, "EXTRA": "1"}},
            "renamed var value": {"vars": {**vars_, "NEXT_PUBLIC_APP_URL": "https://staging.example"}},
            "workers_dev on": {"workers_dev": True},
            "preview_urls on": {"preview_urls": True},
            "source maps uploaded": {"upload_source_maps": True},
        }
        for name, patch in cases.items():
            with self.subTest(name):
                with self.assertRaisesRegex(ValueError, "contract drift"):
                    self.production.validate_output(self.cutover(patch=patch))

    def test_staging_output_is_not_accepted_as_production(self):
        with self.assertRaisesRegex(ValueError, "contract drift|missing normalized output field"):
            self.production.validate_output(self.fixture(json.loads(json.dumps(artifact.NORMALIZED_DEFAULTS["services"])), artifact=artifact))

    def test_cli_rejects_unknown_profile(self):
        import subprocess, sys
        result = subprocess.run([sys.executable, str(HERE / "mind-native-artifact.py"), "--profile", "preview", "config", "apps/mind"], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("profile", result.stderr)


if __name__ == "__main__":
    unittest.main()
