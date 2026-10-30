import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "android_config", Path(__file__).with_name("firebase-android-development.py")
)
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class AndroidDevelopmentTests(unittest.TestCase):
    def test_identity_and_permissions(self):
        values = {
            "project_info": {"project_id": "tuturuuu-mobile-dev"},
            "client": [{"client_info": {
                "mobilesdk_app_id": "1:90814255724:android:049567a22fe2e1b5283e49",
                "android_client_info": {"package_name": "com.tuturuuu.app.mobile.dev"},
            }}],
        }
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "development/google-services.json"
            raw = json.dumps(values)
            config.hydrate(raw, target)
            self.assertEqual(target.read_text(), raw)
            self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            for invalid in ("", "{}", "[]", "null", "invalid"):
                with self.assertRaises(ValueError):
                    config.hydrate(invalid, target)
            values["project_info"]["project_id"] = "tuturuuu-mobile"
            with self.assertRaises(ValueError):
                config.hydrate(json.dumps(values), target)
            self.assertEqual(target.read_text(), raw)


if __name__ == "__main__":
    unittest.main()
