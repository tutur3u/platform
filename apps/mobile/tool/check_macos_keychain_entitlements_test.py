"""Exercise emitted entitlement validation without invoking codesign."""

import contextlib
import io
import plistlib
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from check_macos_keychain_entitlements import check_app


BUNDLE = "com.tuturuuu.app.mobile"
APPLICATION = f"TESTTEAM01.{BUNDLE}"


class CheckAppTest(unittest.TestCase):
    def check_entitlements(self, entitlements):
        with tempfile.TemporaryDirectory() as directory:
            app = Path(directory) / "Runner.app"
            contents = app / "Contents"
            contents.mkdir(parents=True)
            (contents / "Info.plist").write_bytes(
                plistlib.dumps({"CFBundleIdentifier": BUNDLE})
            )
            result = subprocess.CompletedProcess(
                args=[], returncode=0, stdout=plistlib.dumps(entitlements)
            )
            with patch(
                "check_macos_keychain_entitlements.subprocess.run",
                return_value=result,
            ) as run, contextlib.redirect_stdout(io.StringIO()):
                try:
                    check_app(app)
                finally:
                    run.assert_called_once_with(
                        ["codesign", "-d", "--entitlements", "-", str(app)],
                        check=True, capture_output=True,
                    )

    def test_valid_signed_entitlements(self):
        self.check_entitlements({
            "keychain-access-groups": [APPLICATION],
            "com.apple.application-identifier": APPLICATION,
        })

    def test_missing_prefix(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({
                "keychain-access-groups": [BUNDLE],
                "com.apple.application-identifier": BUNDLE,
            })

    def test_missing_application_identifier(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({"keychain-access-groups": [APPLICATION]})

    def test_unprefixed_group_without_application_identifier(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({"keychain-access-groups": [BUNDLE]})

    def test_empty_signing_prefix(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({
                "keychain-access-groups": [f".{BUNDLE}"],
                "com.apple.application-identifier": f".{BUNDLE}",
            })

    def test_malformed_signing_prefix(self):
        for prefix in (".", " ", "\t", "TESTTEAM0", "TESTTEAM010",
                       "testteam01", "TESTTEAM-1", "TESTTEAM01\n"):
            with self.subTest(prefix=prefix), self.assertRaises(ValueError):
                application = f"{prefix}.{BUNDLE}"
                self.check_entitlements({
                    "keychain-access-groups": [application],
                    "com.apple.application-identifier": application,
                })

    def test_unresolved_prefix(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({
                "keychain-access-groups": [f"$(AppIdentifierPrefix){BUNDLE}"],
                "com.apple.application-identifier": f"$(AppIdentifierPrefix){BUNDLE}",
            })

    def test_mismatched_application_identifier(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({
                "keychain-access-groups": [APPLICATION],
                "com.apple.application-identifier": f"OTHERTEAM1.{BUNDLE}",
            })

    def test_other_bundle(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({
                "keychain-access-groups": ["TESTTEAM01.com.example.other"],
                "com.apple.application-identifier": "TESTTEAM01.com.example.other",
            })

    def test_missing_group(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({"com.apple.application-identifier": APPLICATION})

    def test_multiple_groups(self):
        with self.assertRaises(ValueError):
            self.check_entitlements({
                "keychain-access-groups": [APPLICATION, f"OTHERTEAM1.{BUNDLE}"],
                "com.apple.application-identifier": APPLICATION,
            })


if __name__ == "__main__":
    unittest.main()
