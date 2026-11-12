"""Source-only regression coverage for the Infrastructure artifact wrapper."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).parent
SHA = "d" * 40


def load(profile):
    key = "VITE_INFRASTRUCTURE_NATIVE_PROFILE"
    previous = os.environ.get(key)
    if profile is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = profile
    try:
        spec = importlib.util.spec_from_file_location(
            "infrastructure_artifact_" + (profile or "default"),
            HERE / "infrastructure-native-artifact.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.load()
    finally:
        if previous is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = previous


class InfrastructureArtifactTest(unittest.TestCase):
    def test_profiles_pin_worker_identity_and_receipts(self):
        staging = load(None)
        explicit = load("staging")
        production = load("production")
        for module in (staging, explicit):
            self.assertEqual(module.IDENTITY["name"], "tuturuuu-infrastructure-vite-staging")
            self.assertFalse(module.IDENTITY["workers_dev"])
            self.assertFalse(module.IDENTITY["preview_urls"])
            self.assertEqual(module.IDENTITY["vars"], {"TUTURUUU_NOINDEX": "1"})
            self.assertEqual(module.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-infrastructure-vite-staging")
            self.assertIs(module.NORMALIZED_DEFAULTS["upload_source_maps"], True)
            self.assertEqual(module.RECEIPT, "infrastructure-native-artifact.json")
        self.assertEqual(production.IDENTITY["name"], "tuturuuu-infrastructure")
        self.assertFalse(production.IDENTITY["workers_dev"])
        self.assertFalse(production.IDENTITY["preview_urls"])
        self.assertEqual(production.IDENTITY["vars"], {
            "TUTURUUU_NOINDEX": "0",
            "NODE_ENV": "production",
            "TUTURUUU_REQUIRE_SECRETS": "1",
            "NEXT_PUBLIC_APP_URL": "https://infrastructure.tuturuuu.com",
            "NEXT_PUBLIC_WEB_APP_URL": "https://tuturuuu.com",
        })
        self.assertEqual(production.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-infrastructure")
        self.assertIs(production.NORMALIZED_DEFAULTS["upload_source_maps"], False)
        self.assertNotIn("preview_urls", production.NORMALIZED_DEFAULTS)
        self.assertEqual(production.RECEIPT, "infrastructure-native-artifact.json")
        self.assertEqual(production.PUBLIC_FILES, ("robots.txt",))

    def test_profiles_preserve_config_bytes_and_reject_other_identity(self):
        spec = importlib.util.spec_from_file_location(
            "infrastructure_shared_artifact_tests", HERE / "apps-native-artifact.test.py"
        )
        shared = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(shared)
        for profile, other in (("staging", "production"), ("production", "staging")):
            with self.subTest(profile=profile):
                module = load(profile)
                fixture = shared.ArtifactTest()
                try:
                    app, config, pointer = fixture.fixture()
                    config.update(module.IDENTITY)
                    config["upload_source_maps"] = module.NORMALIZED_DEFAULTS["upload_source_maps"]
                    config["topLevelName"] = module.IDENTITY["name"]
                    fixture.save(app, config, pointer)
                    path = app / "dist/native/wrangler.json"
                    original = path.read_bytes()
                    module.validate_output(app)
                    receipt = module.artifact(app, SHA)
                    receipt_path = app / "receipt.json"
                    receipt_path.write_text(json.dumps(receipt))
                    module.pack(app, receipt_path, app / "artifact.tar.gz", SHA)
                    self.assertEqual(path.read_bytes(), original)
                    with self.assertRaisesRegex(ValueError, "contract drift: name"):
                        load(other).validate_output(app)
                finally:
                    fixture.doCleanups()

    def test_production_security_settings_cannot_be_removed_or_weakened(self):
        spec = importlib.util.spec_from_file_location(
            "infrastructure_shared_security_tests", HERE / "apps-native-artifact.test.py"
        )
        shared = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(shared)
        module = load("production")
        required = {
            "TUTURUUU_NOINDEX": "0",
            "NODE_ENV": "production",
            "TUTURUUU_REQUIRE_SECRETS": "1",
            "NEXT_PUBLIC_APP_URL": "https://infrastructure.tuturuuu.com",
            "NEXT_PUBLIC_WEB_APP_URL": "https://tuturuuu.com",
        }
        fixture = shared.ArtifactTest()
        try:
            app, config, pointer = fixture.fixture()
            config.update(module.IDENTITY)
            config["topLevelName"] = "tuturuuu-infrastructure"
            config["vars"] = dict(required)
            config["upload_source_maps"] = False
            fixture.save(app, config, pointer)
            module.validate_output(app)
            for key in required:
                with self.subTest(missing=key):
                    config["vars"] = dict(required)
                    del config["vars"][key]
                    fixture.save(app, config, pointer)
                    with self.assertRaisesRegex(ValueError, "contract drift: vars"):
                        module.validate_output(app)
            for key, value in (
                ("NODE_ENV", "development"),
                ("TUTURUUU_REQUIRE_SECRETS", "0"),
                ("NEXT_PUBLIC_APP_URL", "https://foreign.invalid"),
                ("NEXT_PUBLIC_WEB_APP_URL", "http://tuturuuu.com"),
            ):
                with self.subTest(weakened=key):
                    config["vars"] = {**required, key: value}
                    fixture.save(app, config, pointer)
                    with self.assertRaisesRegex(ValueError, "contract drift: vars"):
                        module.validate_output(app)
            config["vars"] = dict(required)
            for value in (True, None, "false"):
                with self.subTest(upload_source_maps=value):
                    config["upload_source_maps"] = value
                    fixture.save(app, config, pointer)
                    with self.assertRaisesRegex(ValueError, "contract drift: upload_source_maps"):
                        module.validate_output(app)
        finally:
            fixture.doCleanups()

    def test_unknown_profile_rejected(self):
        env = os.environ.copy()
        env["VITE_INFRASTRUCTURE_NATIVE_PROFILE"] = "prod"
        result = subprocess.run(
            [sys.executable, str(HERE / "infrastructure-native-artifact.py"), "config", "apps/infrastructure"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown infrastructure native profile", result.stderr)

    def test_cli_requires_git_source_sha(self):
        env = os.environ.copy()
        env.pop("APPS_SOURCE_SHA", None)
        env.pop("INFRASTRUCTURE_SOURCE_SHA", None)
        env["VITE_INFRASTRUCTURE_NATIVE_PROFILE"] = "production"
        missing = subprocess.run(
            [sys.executable, str(HERE / "infrastructure-native-artifact.py"), "seal", "apps/infrastructure", "--receipt", "/tmp/infrastructure-artifact-missing.json"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("exact source SHA required", missing.stderr)
        env["INFRASTRUCTURE_SOURCE_SHA"] = SHA
        present = subprocess.run(
            [sys.executable, str(HERE / "infrastructure-native-artifact.py"), "seal", "apps/infrastructure", "--receipt", "/tmp/infrastructure-artifact-present.json"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotIn("exact source SHA required", present.stderr)


if __name__ == "__main__":
    unittest.main()
