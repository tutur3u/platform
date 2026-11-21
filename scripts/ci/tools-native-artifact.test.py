"""The tools wrapper pins its Worker identity and the shared abuse-guard binding."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).with_name("tools-native-artifact.py")
GUARD = [{"binding": "ABUSE_GUARD", "service": "tuturuuu-abuse-guard", "entrypoint": "AbuseGuardEntrypoint"}]


def load_wrapper(profile):
    with patch.dict(os.environ, {"VITE_TOOLS_NATIVE_PROFILE": profile}):
        spec = importlib.util.spec_from_file_location(f"tools_artifact_{profile}", SCRIPT)
        wrapper = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(wrapper)
        return wrapper


class ToolsArtifactTest(unittest.TestCase):
    def test_profiles_bind_the_shared_guard_for_the_proxy_family(self):
        for profile, worker, noindex in (
            ("staging", "tuturuuu-tools-vite-staging", "1"),
            ("production", "tuturuuu-tools", "0"),
        ):
            wrapper = load_wrapper(profile)
            module = wrapper.load()
            self.assertEqual(wrapper.SERVICES, GUARD)
            self.assertEqual(module.IDENTITY["name"], worker)
            self.assertEqual(module.IDENTITY["vars"], {"TUTURUUU_NOINDEX": noindex, "ABUSE_GUARD_FAMILIES": "proxy"})
            self.assertEqual(module.NORMALIZED_DEFAULTS["topLevelName"], worker)
            self.assertEqual(module.NORMALIZED_DEFAULTS["services"], GUARD)
            self.assertEqual(module.RECEIPT, "tools-native-artifact.json")

    def test_unknown_profile_is_refused(self):
        with self.assertRaisesRegex(ValueError, "Unknown tools native profile"):
            load_wrapper("prod")


if __name__ == "__main__":
    unittest.main()
