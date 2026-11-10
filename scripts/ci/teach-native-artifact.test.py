"""Source-only regression coverage for the Teach artifact wrapper."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).parent
SPEC = importlib.util.spec_from_file_location("teach_artifact", HERE / "teach-native-artifact.py")
wrapper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(wrapper)
SHA = "d" * 40


class TeachArtifactTest(unittest.TestCase):
    def test_profiles_pin_worker_identity_and_receipts(self):
        staging = wrapper.load()
        production = wrapper.load("production")
        self.assertEqual(staging.IDENTITY["name"], "tuturuuu-teach-vite-staging")
        self.assertTrue(staging.IDENTITY["workers_dev"])
        self.assertEqual(staging.RECEIPT, "teach-native-artifact.json")
        self.assertEqual(production.IDENTITY["name"], "tuturuuu-teach")
        self.assertFalse(production.IDENTITY["workers_dev"])
        self.assertEqual(production.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-teach")
        self.assertFalse(production.NORMALIZED_DEFAULTS["preview_urls"])
        self.assertFalse(production.NORMALIZED_DEFAULTS["upload_source_maps"])
        self.assertEqual(production.RECEIPT, "teach-production-artifact.json")
        self.assertEqual(production.IDENTITY["vars"]["NEXT_PUBLIC_APP_URL"], "https://teach.tuturuuu.com")
        self.assertEqual(wrapper.PUBLIC_FILES, ("robots.txt", "sitemap.xml"))

    def test_cli_requires_teach_source_sha(self):
        env = dict(os.environ)
        env.pop("APPS_SOURCE_SHA", None)
        env.pop("TEACH_SOURCE_SHA", None)
        missing = subprocess.run([sys.executable, str(HERE / "teach-native-artifact.py"), "config", "apps/teach"], env=env, capture_output=True)
        self.assertNotEqual(missing.returncode, 0)
        env["TEACH_SOURCE_SHA"] = SHA
        self.assertEqual(env["TEACH_SOURCE_SHA"], SHA)


if __name__ == "__main__":
    unittest.main()
