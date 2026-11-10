"""The infrastructure wrapper seals the staging output by default and the
workflow-rewritten production output under ``--profile production``."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest

HERE = Path(__file__).parent
SCRIPT = HERE / "infrastructure-native-artifact.py"
spec = importlib.util.spec_from_file_location("infrastructure_artifact", SCRIPT)
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
staging = wrapper.load()
production = wrapper.load("production")
base_spec = importlib.util.spec_from_file_location("apps_artifact_for_infrastructure", HERE / "apps-native-artifact.py")
base = importlib.util.module_from_spec(base_spec)
base_spec.loader.exec_module(base)
SHA = "0123456789abcdef0123456789abcdef01234567"


class InfrastructureProfileTest(unittest.TestCase):
    def fixture(self, artifact, drop=(), patch=None):
        temporary = tempfile.TemporaryDirectory(prefix="infrastructure-output-fixture-")
        self.addCleanup(temporary.cleanup)
        app = Path(temporary.name)
        for directory in ("dist/native", "dist/client", ".wrangler/deploy", "public"):
            (app / directory).mkdir(parents=True)
        for name in wrapper.PUBLIC_FILES:
            (app / "public" / name).write_bytes(b"source " + name.encode())
            (app / "dist/client" / name).write_bytes(b"source " + name.encode())
        (app / "dist/native/index.js").write_text("export default {fetch(){return new Response('fixture')}}")
        config = {
            **artifact.IDENTITY,
            **artifact.NORMALIZED_DEFAULTS,
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

    def cli(self, *args, env=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            capture_output=True,
            text=True,
            env={**{k: v for k, v in os.environ.items() if k not in ("APPS_SOURCE_SHA", "INFRASTRUCTURE_SOURCE_SHA", "GITHUB_OUTPUT")}, **(env or {})},
        )

    def test_default_profile_is_the_unchanged_staging_contract(self):
        self.assertEqual(wrapper.load("staging").IDENTITY, staging.IDENTITY)
        self.assertEqual(staging.IDENTITY["name"], "tuturuuu-infrastructure-vite-staging")
        self.assertEqual(staging.IDENTITY["vars"], {"TUTURUUU_NOINDEX": "1"})
        self.assertEqual(staging.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-infrastructure-vite-staging")
        self.assertTrue(staging.NORMALIZED_DEFAULTS["upload_source_maps"])
        self.assertNotIn("preview_urls", staging.NORMALIZED_DEFAULTS)
        self.assertEqual(staging.RECEIPT, "infrastructure-native-artifact.json")
        staging.validate_output(self.fixture(staging))

    def test_production_profile_pins_worker_receipt_and_vars(self):
        self.assertEqual(production.IDENTITY["name"], "tuturuuu-infrastructure")
        self.assertEqual(production.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-infrastructure")
        self.assertFalse(production.IDENTITY["workers_dev"])
        self.assertFalse(production.NORMALIZED_DEFAULTS["preview_urls"])
        self.assertFalse(production.NORMALIZED_DEFAULTS["upload_source_maps"])
        self.assertEqual(production.RECEIPT, "infrastructure-production-artifact.json")
        self.assertEqual(production.IDENTITY["vars"], {
            "TUTURUUU_NOINDEX": "0",
            "NODE_ENV": "production",
            "TUTURUUU_REQUIRE_SECRETS": "1",
            "NEXT_PUBLIC_APP_URL": "https://infrastructure.tuturuuu.com",
            "NEXT_PUBLIC_WEB_APP_URL": "https://tuturuuu.com",
        })

    def test_actual_workflow_rewrite_preserves_emitted_contract(self):
        app = self.fixture(staging)
        workflow = (HERE.parents[1] / ".github/workflows/infrastructure-cloudflare.yaml").read_text()
        script = workflow.split("          node --input-type=module <<'JS'\n", 1)[1].split("          JS\n", 1)[0]
        with tempfile.TemporaryDirectory(prefix="infrastructure-workflow-") as temporary:
            root = Path(temporary)
            server = root / "apps/infrastructure/dist/server"
            server.parent.mkdir(parents=True)
            server.symlink_to(app / "dist/native", target_is_directory=True)
            result = subprocess.run(["node", "--input-type=module"], input=textwrap.dedent(script), cwd=root, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
        production.validate_output(app)

    def test_rewritten_production_output_passes(self):
        production.validate_output(self.fixture(production))

    def test_staging_and_production_outputs_do_not_cross_validate(self):
        with self.assertRaisesRegex(ValueError, "contract drift|missing normalized output field"):
            production.validate_output(self.fixture(staging))
        with self.assertRaisesRegex(ValueError, "contract drift|missing normalized output field"):
            staging.validate_output(self.fixture(production))

    def test_rewrite_that_deletes_emitted_fields_is_rejected(self):
        for key in ("configPath", "userConfigPath", "topLevelName", "definedEnvironments"):
            with self.subTest(key=key):
                with self.assertRaisesRegex(ValueError, "missing normalized output field|unreviewed producer config"):
                    production.validate_output(self.fixture(production, drop=(key,)))

    def test_missing_extra_and_renamed_production_values_are_rejected(self):
        vars_ = production.IDENTITY["vars"]
        cases = {
            "worker renamed": {"name": "tuturuuu-infrastructure-vite-staging"},
            "topLevelName renamed": {"topLevelName": "tuturuuu-infrastructure-vite-staging"},
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
                    production.validate_output(self.fixture(production, patch=patch))

    def test_cli_accepts_the_workflow_production_calls_end_to_end(self):
        app = self.fixture(production)
        receipt = app / "production-receipt.json"
        archive = app / "production.tar.gz"
        output = app / "github-output"
        env = {"INFRASTRUCTURE_SOURCE_SHA": SHA, "GITHUB_OUTPUT": str(output)}
        for args in (
            ("--profile", "production", "config", str(app)),
            ("--profile", "production", "seal", str(app), "--receipt", str(receipt)),
            ("--profile", "production", "pack", str(app), "--receipt", str(receipt), "--archive", str(archive)),
        ):
            with self.subTest(args=args[2]):
                result = self.cli(*args, env=env)
                self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(receipt.read_text())["worker"], "tuturuuu-infrastructure")
        self.assertTrue(archive.is_file())

    def test_cli_staging_call_has_no_profile_and_rejects_production_output(self):
        env = {"GITHUB_OUTPUT": "/dev/null"}
        self.assertEqual(self.cli("config", str(self.fixture(staging)), env=env).returncode, 0)
        result = self.cli("config", str(self.fixture(production)), env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ValueError", result.stderr)

    def test_cli_rejects_unknown_or_missing_profile(self):
        for args in (("--profile", "preview", "config", "apps/infrastructure"), ("--profile",)):
            with self.subTest(args=args):
                result = self.cli(*args)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("profile", result.stderr)


if __name__ == "__main__":
    unittest.main()
