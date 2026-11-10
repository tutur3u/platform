"""Source-only regression coverage for the Chat artifact wrapper."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest

HERE = Path(__file__).parent
SHA = "d" * 40


def load_wrapper(profile=None):
    # The wrapper reads the profile at import time, the same way the cutover job does.
    saved = os.environ.get("VITE_CHAT_NATIVE_PROFILE")
    os.environ.pop("VITE_CHAT_NATIVE_PROFILE", None)
    if profile is not None:
        os.environ["VITE_CHAT_NATIVE_PROFILE"] = profile
    try:
        spec = importlib.util.spec_from_file_location(
            f"chat_artifact_{profile or 'staging'}", HERE / "chat-native-artifact.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module
    finally:
        if saved is None:
            os.environ.pop("VITE_CHAT_NATIVE_PROFILE", None)
        else:
            os.environ["VITE_CHAT_NATIVE_PROFILE"] = saved


class ChatArtifactTest(unittest.TestCase):
    def test_profiles_pin_worker_identity_and_receipts(self):
        staging = load_wrapper()
        production = load_wrapper("production")
        self.assertEqual(staging.WORKER, "tuturuuu-chat-vite-staging")
        self.assertEqual(staging.load().IDENTITY["name"], "tuturuuu-chat-vite-staging")
        self.assertFalse(staging.load().IDENTITY["workers_dev"])
        self.assertFalse(staging.load().IDENTITY["preview_urls"])
        self.assertEqual(staging.load().IDENTITY["vars"], {"TUTURUUU_NOINDEX": "1"})
        self.assertEqual(staging.load().NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-chat-vite-staging")
        self.assertEqual(staging.load().RECEIPT, "chat-native-artifact.json")
        self.assertEqual(production.WORKER, "tuturuuu-chat")
        self.assertEqual(production.load().IDENTITY["name"], "tuturuuu-chat")
        self.assertFalse(production.load().IDENTITY["workers_dev"])
        self.assertFalse(production.load().IDENTITY["preview_urls"])
        self.assertEqual(production.load().IDENTITY["vars"], {"TUTURUUU_NOINDEX": "0"})
        self.assertEqual(production.load().NORMALIZED_DEFAULTS["topLevelName"], "tuturuuu-chat")
        self.assertEqual(production.load().RECEIPT, "chat-native-artifact.json")
        self.assertEqual(production.PUBLIC_FILES, ("robots.txt",))
        self.assertNotIn("routes", production.load().IDENTITY)
        self.assertNotIn("routes", production.load().NORMALIZED_DEFAULTS)

    def test_unknown_profile_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unknown chat native profile"):
            load_wrapper("prod")

    def test_cli_requires_chat_source_sha(self):
        env = dict(os.environ)
        env.pop("APPS_SOURCE_SHA", None)
        env.pop("CHAT_SOURCE_SHA", None)
        env.pop("VITE_CHAT_NATIVE_PROFILE", None)
        missing = subprocess.run(
            [sys.executable, str(HERE / "chat-native-artifact.py"), "config", "apps/chat"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(missing.returncode, 0)
        env["CHAT_SOURCE_SHA"] = SHA
        forwarded = subprocess.run(
            [sys.executable, str(HERE / "chat-native-artifact.py"), "config", "apps/chat"],
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(forwarded.returncode, 0)
        self.assertNotIn("APPS_SOURCE_SHA", missing.stderr + missing.stdout)


if __name__ == "__main__":
    unittest.main()
