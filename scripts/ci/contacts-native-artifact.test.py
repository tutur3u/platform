"""Exercise the Contacts seal and private ingress contract without a build."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "contacts_artifact", Path(__file__).with_name("contacts-native-artifact.py")
)
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
artifact = wrapper.load()
SHA = "c" * 40


class ContactsArtifactTest(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="contacts-artifact-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.app = self.root / "producer"
        for directory in ("dist/server", "dist/client", ".wrangler/deploy", "public"):
            (self.app / directory).mkdir(parents=True)
        self.public_asset = b"User-agent: *\nDisallow: /\n"
        for directory in ("dist/client", "public"):
            (self.app / directory / "robots.txt").write_bytes(self.public_asset)
        (self.app / "dist/server/entry.js").write_text("export default {};\n")
        self.config_path = self.app / "dist/server/wrangler.json"
        producer_config = str(self.app / ".void-wrangler.jsonc")
        self.config = {
            **artifact.IDENTITY,
            **artifact.NORMALIZED_DEFAULTS,
            "configPath": producer_config,
            "userConfigPath": producer_config,
            "main": "entry.js",
            "assets": {
                "binding": "ASSETS",
                "directory": "../client",
                "run_worker_first": True,
                "not_found_handling": "none",
            },
        }
        self.config_path.write_text(json.dumps(self.config))
        (self.app / artifact.REDIRECT).write_text(json.dumps({
            "configPath": "../../dist/server/wrangler.json",
            "auxiliaryWorkers": [],
        }))

    def test_rejects_public_ingress_and_missing_private_defaults(self):
        artifact.validate_output(self.app)
        for key, value, error in (
            ("workers_dev", True, "contract drift: workers_dev"),
            ("preview_urls", True, "contract drift: preview_urls"),
            ("routes", ["contacts.tuturuuu.com/*"], "unreviewed emitted config"),
            ("routes", [{"pattern": "contacts.tuturuuu.com", "custom_domain": True}],
             "unreviewed emitted config"),
            ("route", "contacts.tuturuuu.com/*", "unreviewed emitted config"),
            ("custom_domains", ["contacts.tuturuuu.com"], "unreviewed emitted config"),
        ):
            with self.subTest(key=key, value=value):
                self.config_path.write_text(json.dumps({**self.config, key: value}))
                with self.assertRaisesRegex(ValueError, error):
                    artifact.validate_output(self.app)
        for key in ("workers_dev", "preview_urls"):
            with self.subTest(missing=key):
                config = dict(self.config)
                del config[key]
                self.config_path.write_text(json.dumps(config))
                with self.assertRaisesRegex(ValueError, "missing normalized output field"):
                    artifact.validate_output(self.app)

    def test_sealed_archive_restores_same_contacts_bytes_and_source(self):
        self.assertEqual(self.config["name"], "tuturuuu-contacts")
        self.assertIs(self.config["workers_dev"], False)
        self.assertIs(self.config["preview_urls"], False)
        receipt = artifact.sealed_receipt(self.app, SHA, {})
        receipt_path = self.root / "sealed.json"
        receipt_path.write_text(json.dumps(receipt))
        archive = self.root / "native.tar.gz"
        artifact.pack(self.app, receipt_path, archive, SHA)
        target = self.root / "restored"
        (target / "public").mkdir(parents=True)
        (target / "public/robots.txt").write_bytes(self.public_asset)
        restored_receipt = self.root / "restored.json"
        with self.assertRaisesRegex(ValueError, "wrong source receipt"):
            artifact.restore(target, archive, restored_receipt, "d" * 40)
        artifact.restore(target, archive, restored_receipt, SHA)
        self.assertEqual(json.loads(restored_receipt.read_text()), receipt)
        self.assertEqual(
            (target / "dist/server/wrangler.json").read_bytes(),
            self.config_path.read_bytes(),
        )
        (target / "dist/server/entry.js").write_text("export default { fetch() {} };\n")
        with self.assertRaisesRegex(ValueError, "differs from sealed exact-source output"):
            artifact.verify(target, receipt, SHA)


if __name__ == "__main__":
    unittest.main()
