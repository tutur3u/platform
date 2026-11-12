"""The infrastructure wrapper takes --profile before the shared seal mode."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    "infrastructure_artifact", HERE / "infrastructure-native-artifact.py"
)
wrapper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wrapper)
SCRIPT = HERE / "infrastructure-native-artifact.py"


class InfrastructureArtifactTest(unittest.TestCase):
    def test_profiles_pin_worker_identity_and_receipts(self):
        staging = wrapper.load()
        production = wrapper.load("production")
        self.assertEqual(staging.IDENTITY["name"], "tuturuuu-infrastructure-vite-staging")
        self.assertFalse(staging.IDENTITY["workers_dev"])
        self.assertEqual(staging.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-infrastructure-vite-staging")
        self.assertEqual(staging.NORMALIZED_DEFAULTS["services"], [])
        self.assertEqual(staging.RECEIPT, "infrastructure-native-artifact.json")
        self.assertEqual(production.IDENTITY["name"], "tuturuuu-infrastructure")
        self.assertFalse(production.IDENTITY["workers_dev"])
        self.assertEqual(production.IDENTITY["vars"]["TUTURUUU_NOINDEX"], "0")
        self.assertEqual(production.IDENTITY["vars"]["NODE_ENV"], "production")
        self.assertEqual(production.IDENTITY["vars"]["TUTURUUU_REQUIRE_SECRETS"], "1")
        self.assertEqual(production.IDENTITY["vars"]["NEXT_PUBLIC_APP_URL"], "https://infrastructure.tuturuuu.com")
        self.assertEqual(production.IDENTITY["vars"]["NEXT_PUBLIC_WEB_APP_URL"], "https://tuturuuu.com")
        self.assertEqual(production.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-infrastructure")
        self.assertFalse(production.NORMALIZED_DEFAULTS["preview_urls"])
        self.assertFalse(production.NORMALIZED_DEFAULTS["upload_source_maps"])
        self.assertEqual(production.NORMALIZED_DEFAULTS["services"], [])
        self.assertEqual(production.RECEIPT, "infrastructure-production-artifact.json")
        self.assertEqual(wrapper.PUBLIC_FILES, ("robots.txt",))
        with self.assertRaisesRegex(ValueError, "unknown Infrastructure artifact profile"):
            wrapper.load("staging-production")

    def test_profile_flag_is_not_a_mode(self):
        env = dict(os.environ)
        env.pop("APPS_SOURCE_SHA", None)
        env.pop("INFRASTRUCTURE_SOURCE_SHA", None)
        env["GITHUB_OUTPUT"] = os.devnull
        flagged = subprocess.run(
            [sys.executable, str(SCRIPT), "--profile", "production", "config", "apps/infrastructure"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotIn("invalid choice", flagged.stderr)
        self.assertNotEqual(flagged.returncode, 0)
        positional = subprocess.run(
            [sys.executable, str(SCRIPT), "production", "config", "apps/infrastructure"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertIn("invalid choice: 'production'", positional.stderr)
        self.assertNotEqual(positional.returncode, 0)


if __name__ == "__main__":
    unittest.main()
