"""Source-only regression coverage for the Git artifact wrapper."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).parent
SHA = "d" * 40


def load(profile):
    key = "VITE_GIT_NATIVE_PROFILE"
    previous = os.environ.get(key)
    if profile is None:
        os.environ.pop(key, None)
    else:
        os.environ[key] = profile
    try:
        spec = importlib.util.spec_from_file_location(
            "git_artifact_" + (profile or "default"),
            HERE / "git-native-artifact.py",
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module.load()
    finally:
        if previous is None:
            os.environ.pop(key, None)
        else:
            os.environ[key] = previous


class GitArtifactTest(unittest.TestCase):
    def test_profiles_pin_worker_identity_and_receipts(self):
        staging = load(None)
        explicit = load("staging")
        production = load("production")
        for module in (staging, explicit):
            self.assertEqual(module.IDENTITY["name"], "tuturuuu-git-vite-staging")
            self.assertFalse(module.IDENTITY["workers_dev"])
            self.assertFalse(module.IDENTITY["preview_urls"])
            self.assertEqual(module.IDENTITY["vars"], {"TUTURUUU_NOINDEX": "1"})
            self.assertEqual(module.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-git-vite-staging")
            self.assertIs(module.NORMALIZED_DEFAULTS["upload_source_maps"], True)
            self.assertEqual(module.RECEIPT, "git-native-artifact.json")
        self.assertEqual(production.IDENTITY["name"], "tuturuuu-git")
        self.assertFalse(production.IDENTITY["workers_dev"])
        self.assertFalse(production.IDENTITY["preview_urls"])
        self.assertEqual(production.IDENTITY["vars"], {"TUTURUUU_NOINDEX": "0"})
        self.assertEqual(production.NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-git")
        self.assertIs(production.NORMALIZED_DEFAULTS["upload_source_maps"], True)
        self.assertNotIn("preview_urls", production.NORMALIZED_DEFAULTS)
        self.assertEqual(production.RECEIPT, "git-native-artifact.json")
        self.assertEqual(production.PUBLIC_FILES, ("robots.txt", "sitemap.xml"))

    def test_unknown_profile_rejected(self):
        env = os.environ.copy()
        env["VITE_GIT_NATIVE_PROFILE"] = "prod"
        result = subprocess.run(
            [sys.executable, str(HERE / "git-native-artifact.py"), "config", "apps/git"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unknown git native profile", result.stderr)

    def test_cli_requires_git_source_sha(self):
        env = os.environ.copy()
        env.pop("APPS_SOURCE_SHA", None)
        env.pop("GIT_SOURCE_SHA", None)
        env["VITE_GIT_NATIVE_PROFILE"] = "production"
        with tempfile.TemporaryDirectory(prefix="git-artifact-") as temporary:
            receipt = str(Path(temporary) / "receipt.json")
            missing = subprocess.run(
                [sys.executable, str(HERE / "git-native-artifact.py"), "seal", "apps/git", "--receipt", receipt],
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotEqual(missing.returncode, 0)
            self.assertIn("exact source SHA required", missing.stderr)
            env["GIT_SOURCE_SHA"] = SHA
            present = subprocess.run(
                [sys.executable, str(HERE / "git-native-artifact.py"), "seal", "apps/git", "--receipt", receipt],
                env=env,
                capture_output=True,
                text=True,
            )
            self.assertNotIn("exact source SHA required", present.stderr)


if __name__ == "__main__":
    unittest.main()
