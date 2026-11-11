"""Source-only regressions for the workspace artifact wrapper."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/ci/workspace-native-artifact.py"
SHA = "c" * 40
CONTRACT = r"""
import importlib.util
import json
from pathlib import Path
spec = importlib.util.spec_from_file_location("workspace_artifact", Path(r"%s"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
loaded = module.load()
print(json.dumps({
    "name": loaded.IDENTITY["name"],
    "workers_dev": loaded.IDENTITY["workers_dev"],
    "preview_urls": loaded.IDENTITY["preview_urls"],
    "routes": "routes" in loaded.IDENTITY,
    "noindex": loaded.IDENTITY["vars"]["TUTURUUU_NOINDEX"],
    "identity": loaded.IDENTITY,
    "defaults": loaded.NORMALIZED_DEFAULTS,
    "public": list(loaded.PUBLIC_FILES),
}))
""" % SCRIPT


def contract(profile=None):
    env = os.environ.copy()
    env.pop("VITE_WORKSPACE_NATIVE_PROFILE", None)
    env.pop("WORKSPACE_SOURCE_SHA", None)
    env.pop("APPS_SOURCE_SHA", None)
    if profile:
        env["VITE_WORKSPACE_NATIVE_PROFILE"] = profile
    completed = subprocess.run(
        [sys.executable, "-c", CONTRACT],
        cwd=ROOT,
        env=env,
        check=False,
        capture_output=True,
        text=True,
    )
    return completed


class WorkspaceArtifactTest(unittest.TestCase):
    def test_staging_identity_is_route_free(self):
        completed = contract()
        self.assertEqual(completed.returncode, 0, completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual(payload["name"], "tuturuuu-workspace-vite-staging")
        self.assertIs(payload["workers_dev"], False)
        self.assertIs(payload["preview_urls"], False)
        self.assertIs(payload["routes"], False)
        self.assertEqual(payload["noindex"], "1")

    def test_production_identity_is_route_free(self):
        completed = contract("production")
        self.assertEqual(completed.returncode, 0, completed.stderr)
        payload = json.loads(completed.stdout)
        self.assertEqual(payload["name"], "tuturuuu-workspace")
        self.assertIs(payload["workers_dev"], False)
        self.assertIs(payload["preview_urls"], False)
        self.assertIs(payload["routes"], False)
        self.assertEqual(payload["noindex"], "0")

    def test_unknown_profile_is_refused(self):
        completed = contract("prod")
        self.assertNotEqual(completed.returncode, 0)
        self.assertIn("Unknown workspace native profile", completed.stderr)

    def fixture(self, profile):
        completed = contract(profile)
        self.assertEqual(completed.returncode, 0, completed.stderr)
        payload = json.loads(completed.stdout)
        temporary = tempfile.TemporaryDirectory(prefix="workspace-output-fixture-")
        self.addCleanup(temporary.cleanup)
        app = Path(temporary.name)
        for directory in ("dist/native", "dist/client/assets", ".wrangler/deploy", "public"):
            (app / directory).mkdir(parents=True)
        for name in payload["public"]:
            (app / "public" / name).write_bytes(b"source " + name.encode())
            (app / "dist/client" / name).write_bytes(b"source " + name.encode())
        (app / "dist/client/assets/entry.js").write_text("export const hydrated = true")
        (app / "dist/native/index.js").write_text(
            "export default {fetch(){return new Response('fixture')}}"
        )
        config = {
            **payload["identity"],
            **payload["defaults"],
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
        (app / ".wrangler/deploy/config.json").write_text(json.dumps({
            "configPath": "../../dist/native/wrangler.json",
            "auxiliaryWorkers": [],
        }))
        return app, config

    def run_cli(self, profile, app, runner, *args):
        env = os.environ.copy()
        env.update({
            "CI": "true",
            "SOURCE_SHA": SHA,
            "WORKSPACE_SOURCE_SHA": SHA,
            "VITE_WORKSPACE_NATIVE_PROFILE": profile,
            "GITHUB_OUTPUT": str(runner / "github-output.txt"),
            "RUNNER_TEMP": str(runner),
        })
        env.pop("APPS_SOURCE_SHA", None)
        return subprocess.run(
            [sys.executable, str(SCRIPT), *args],
            cwd=ROOT,
            env=env,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_production_config_seal_pack(self):
        app, _ = self.fixture("production")
        runner = Path(tempfile.mkdtemp(prefix="workspace-runner-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(runner, ignore_errors=True))
        (runner / "github-output.txt").write_text("")
        config = self.run_cli( "production", app, runner, "config", str(app))
        self.assertEqual(config.returncode, 0, config.stderr)
        output = (runner / "github-output.txt").read_text()
        self.assertIn("config=", output)
        self.assertIn("wrangler.json", output)
        receipt = runner / "workspace-native-artifact.json"
        archive = runner / "workspace-cutover.tar.gz"
        seal = self.run_cli(
            "production", app, runner, "seal", str(app), "--receipt", str(receipt)
        )
        self.assertEqual(seal.returncode, 0, seal.stderr)
        sealed = json.loads(receipt.read_text())
        self.assertEqual(sealed["worker"], "tuturuuu-workspace")
        self.assertEqual(sealed["sourceSha"], SHA)
        pack = self.run_cli(
            "production",
            app,
            runner,
            "pack",
            str(app),
            "--receipt",
            str(receipt),
            "--archive",
            str(archive),
        )
        self.assertEqual(pack.returncode, 0, pack.stderr)
        self.assertTrue(archive.is_file())
        emitted = json.loads((app / "dist/native/wrangler.json").read_text())
        self.assertEqual(emitted["name"], "tuturuuu-workspace")
        self.assertIs(emitted["workers_dev"], False)
        self.assertNotIn("routes", emitted)

    def test_missing_normalized_field_and_routes_are_refused(self):
        app, config = self.fixture("production")
        runner = Path(tempfile.mkdtemp(prefix="workspace-runner-"))
        self.addCleanup(lambda: __import__("shutil").rmtree(runner, ignore_errors=True))
        for key in ("configPath", "userConfigPath", "topLevelName"):
            broken = dict(config)
            broken.pop(key)
            (app / "dist/native/wrangler.json").write_text(json.dumps(broken))
            failed = self.run_cli("production", app, runner, "config", str(app))
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("missing normalized output field", failed.stderr)
        routed = dict(config)
        routed["routes"] = []
        (app / "dist/native/wrangler.json").write_text(json.dumps(routed))
        failed = self.run_cli("production", app, runner, "config", str(app))
        self.assertNotEqual(failed.returncode, 0)
        self.assertIn("unreviewed emitted config field", failed.stderr)


if __name__ == "__main__":
    unittest.main()
