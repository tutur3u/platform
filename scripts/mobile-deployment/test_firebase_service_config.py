#!/usr/bin/env python3
"""Fixture-based development configuration and packaged identity controls."""

import importlib.util
import plistlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "firebase_config", Path(__file__).with_name("firebase-service-config.py")
)
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class FirebaseConfigTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.values = {key: f"fixture-{key}" for key in config.REQUIRED}

    def write(self, path, values):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(plistlib.dumps(values))

    def fixture(self, platform):
        source = self.root / platform / "Runner/GoogleService-Info-development.plist"
        self.write(source, self.values)
        app = self.root / "Fixture.app"
        resources = app / ("Contents/Resources" if platform == "macos" else "")
        self.write(resources / "GoogleService-Info.plist", self.values)
        info = app / ("Contents/Info.plist" if platform == "macos" else "Info.plist")
        self.write(info, {"CFBundleIdentifier": self.values["BUNDLE_ID"]})
        return source, app, resources, info

    def test_prepare_copies_selected_development_configuration(self):
        for platform in ("ios", "macos"):
            with self.subTest(platform=platform):
                source, _, _, _ = self.fixture(platform)
                config.configure(platform, self.root)
                self.assertEqual(source.read_bytes(), source.with_name("GoogleService-Info.plist").read_bytes())

    def test_packaged_development_configuration_and_identity_pass(self):
        for platform in ("ios", "macos"):
            with self.subTest(platform=platform):
                _, app, _, _ = self.fixture(platform)
                config.configure(platform, self.root, app)

    def test_wrong_flavor_is_rejected(self):
        _, app, resources, _ = self.fixture("ios")
        self.write(resources / "GoogleService-Info.plist", {**self.values, "GOOGLE_APP_ID": "other-flavor"})
        with self.assertRaisesRegex(ValueError, "development flavor"):
            config.configure("ios", self.root, app)

    def test_wrong_bundle_identity_is_rejected(self):
        _, app, _, info = self.fixture("macos")
        self.write(info, {"CFBundleIdentifier": "other-app"})
        with self.assertRaisesRegex(ValueError, "identities differ"):
            config.configure("macos", self.root, app)

    def test_missing_malformed_and_dummy_configuration_are_rejected(self):
        source, _, _, _ = self.fixture("ios")
        for value in (b"not a plist", plistlib.dumps({}), plistlib.dumps({**self.values, "CLIENT_ID": "dummy"})):
            source.write_bytes(value)
            with self.assertRaises(ValueError):
                config.configure("ios", self.root)
        source.unlink()
        with self.assertRaises(ValueError):
            config.configure("ios", self.root)

    def test_missing_packaged_configuration_is_rejected(self):
        _, app, resources, _ = self.fixture("ios")
        (resources / "GoogleService-Info.plist").unlink()
        with self.assertRaises(ValueError):
            config.configure("ios", self.root, app)

    def test_workflows_prepare_then_verify_before_upload_without_vault_access(self):
        root = Path(__file__).resolve().parents[2]
        for platform in ("ios", "macos"):
            workflow_path = root / ".github/workflows" / f"mobile-build-{platform}.yaml"
            output = subprocess.check_output([
                "ruby", "-e",
                "require 'yaml'; require 'json'; puts JSON.generate(YAML.load_file(ARGV[0]))",
                str(workflow_path),
            ], text=True)
            workflow = json.loads(output)
            steps = workflow["jobs"][f"build-{platform}"]["steps"]
            prepare = next(i for i, step in enumerate(steps) if step["name"] == "Prepare development Firebase configuration")
            build = next(i for i, step in enumerate(steps) if step["name"].startswith("Build "))
            verify = next(i for i, step in enumerate(steps) if "--app " in step.get("run", ""))
            upload = next(i for i, step in enumerate(steps) if step["name"].startswith("Upload "))
            self.assertLess(prepare, build)
            self.assertLess(build, verify)
            self.assertLess(verify, upload)
            self.assertIn("test_firebase_service_config.py", steps[prepare]["run"])
            source = workflow_path.read_text()
            self.assertNotIn("Create dummy", source)
            self.assertNotIn("MOBILE_DEPLOYMENT_CI_TOKEN", source)
            self.assertNotIn("id-token: write", source)
            self.assertIn('"scripts/mobile-deployment/*firebase*"', source)


if __name__ == "__main__":
    unittest.main()
