"""The rewise seal accepts only the service binding void.config.ts declares."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("rewise_artifact", HERE / "rewise-native-artifact.py")
wrapper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wrapper)
artifact = wrapper.load()
base_spec = importlib.util.spec_from_file_location("apps_artifact_for_rewise", HERE / "apps-native-artifact.py")
base = importlib.util.module_from_spec(base_spec)
base_spec.loader.exec_module(base)
EXACT = [
    {
        "binding": "ABUSE_GUARD",
        "service": "tuturuuu-abuse-guard",
        "entrypoint": "AbuseGuardEntrypoint",
    },
]


class RewiseServiceSealTest(unittest.TestCase):
    def fixture(self, services):
        temporary = tempfile.TemporaryDirectory(prefix="rewise-output-fixture-")
        self.addCleanup(temporary.cleanup)
        app = Path(temporary.name)
        for directory in ("dist/native", "dist/client", ".wrangler/deploy", "public"):
            (app / directory).mkdir(parents=True)
        for name in wrapper.PUBLIC_FILES:
            (app / "public" / name).write_bytes(b"source " + name.encode())
            (app / "dist/client" / name).write_bytes(b"source " + name.encode())
        (app / "dist/native/index.js").write_text("export default {fetch(){return new Response('fixture')}}")
        config = {
            **artifact.IDENTITY,
            **artifact.NORMALIZED_DEFAULTS,
            "services": services,
            "configPath": str(app / ".void-wrangler.jsonc"),
            "userConfigPath": str(app / ".void-wrangler.jsonc"),
            "main": "index.js",
            "assets": {
                "binding": "ASSETS",
                "directory": "../client",
                "run_worker_first": True,
                "not_found_handling": "none",
            },
        }
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        (app / base.REDIRECT).write_text(json.dumps({
            "configPath": "../../dist/native/wrangler.json",
            "auxiliaryWorkers": [],
        }))
        return app

    def test_exact_declared_service_passes(self):
        self.assertEqual(base.NORMALIZED_DEFAULTS["services"], [])
        self.assertEqual(artifact.NORMALIZED_DEFAULTS["services"], EXACT)
        source = (HERE.parents[1] / "apps/rewise/void.config.ts").read_text()
        self.assertIn("binding: 'ABUSE_GUARD'", source)
        self.assertIn("service: 'tuturuuu-abuse-guard'", source)
        self.assertIn("entrypoint: 'AbuseGuardEntrypoint'", source)
        artifact.validate_output(self.fixture(json.loads(json.dumps(EXACT))))

    def test_missing_extra_and_renamed_service_is_rejected(self):
        exact = EXACT[0]
        cases = [
            [],
            [*EXACT, {"binding": "OTHER", "service": "other"}],
            [{**exact, "binding": "RENAMED"}],
            [{**exact, "service": "tuturuuu-other"}],
            [{**exact, "entrypoint": "OtherEntrypoint"}],
            [{k: v for k, v in exact.items() if k != "entrypoint"}],
        ]
        for services in cases:
            with self.subTest(services=services):
                with self.assertRaisesRegex(ValueError, "contract drift: services"):
                    artifact.validate_output(self.fixture(services))


if __name__ == "__main__":
    unittest.main()
