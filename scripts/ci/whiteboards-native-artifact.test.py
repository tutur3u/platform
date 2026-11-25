"""Source-only regression coverage for the Whiteboards artifact wrapper."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).parent
SHA = "d" * 40


def load(profile):
    key = "VITE_WHITEBOARDS_NATIVE_PROFILE"
    previous = os.environ.get(key)
    if profile is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = profile
    try:
        spec = importlib.util.spec_from_file_location(
            "whiteboards_artifact_" + (profile or "default"),
            HERE / "whiteboards-native-artifact.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.load()
    finally:
        if previous is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = previous


class WhiteboardsArtifactTest(unittest.TestCase):
    def test_profiles_pin_worker_identity_and_receipts(self):
        staging = load(None)
        explicit = load("staging")
        production = load("production")
        for module in (staging, explicit):
            self.assertEqual(module.IDENTITY["name"], "tuturuuu-whiteboards-vite-staging")
            self.assertFalse(module.IDENTITY["workers_dev"])
            self.assertFalse(module.IDENTITY["preview_urls"])
            self.assertEqual(module.IDENTITY["vars"], {"TUTURUUU_NOINDEX": "1"})
            self.assertEqual(module.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-whiteboards-vite-staging")
            self.assertIs(module.NORMALIZED_DEFAULTS["upload_source_maps"], True)
            self.assertEqual(module.RECEIPT, "whiteboards-native-artifact.json")
        self.assertEqual(production.IDENTITY["name"], "tuturuuu-whiteboards")
        self.assertFalse(production.IDENTITY["workers_dev"])
        self.assertFalse(production.IDENTITY["preview_urls"])
        self.assertEqual(production.IDENTITY["vars"], {"TUTURUUU_NOINDEX": "0"})
        self.assertEqual(production.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-whiteboards")
        self.assertIs(production.NORMALIZED_DEFAULTS["upload_source_maps"], True)
        self.assertNotIn("preview_urls", production.NORMALIZED_DEFAULTS)
        self.assertEqual(production.RECEIPT, "whiteboards-native-artifact.json")
        self.assertIn("robots.txt", production.PUBLIC_FILES)

    def test_unknown_profile_rejected(self):
        env = os.environ.copy()
        env["VITE_WHITEBOARDS_NATIVE_PROFILE"] = "prod"
        result = subprocess.run(
            [sys.executable, str(HERE / "whiteboards-native-artifact.py"), "config", "apps/whiteboards"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown whiteboards native profile", result.stderr)

    def test_cli_requires_whiteboards_source_sha(self):
        env = os.environ.copy()
        env.pop("APPS_SOURCE_SHA", None)
        env.pop("WHITEBOARDS_SOURCE_SHA", None)
        env["VITE_WHITEBOARDS_NATIVE_PROFILE"] = "production"
        missing = subprocess.run(
            [sys.executable, str(HERE / "whiteboards-native-artifact.py"), "seal", "apps/whiteboards", "--receipt", "/tmp/whiteboards-artifact-missing.json"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("exact source SHA required", missing.stderr)
        env["WHITEBOARDS_SOURCE_SHA"] = SHA
        present = subprocess.run(
            [sys.executable, str(HERE / "whiteboards-native-artifact.py"), "seal", "apps/whiteboards", "--receipt", "/tmp/whiteboards-artifact-present.json"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotIn("exact source SHA required", present.stderr)


if __name__ == "__main__":
    unittest.main()
