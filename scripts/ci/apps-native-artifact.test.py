"""Source-only artifact regressions; no app/compiler/runtime required."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("apps_artifact", Path(__file__).with_name("apps-native-artifact.py"))
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)
SHA = "a" * 40


class ArtifactTest(unittest.TestCase):
    def fixture(self):
        temporary = tempfile.TemporaryDirectory(prefix="apps-output-fixture-")
        self.addCleanup(temporary.cleanup)
        app = Path(temporary.name)
        for directory in ("dist/native", "dist/client/assets", ".wrangler/deploy", "public"):
            (app / directory).mkdir(parents=True)
        for name in artifact.PUBLIC_FILES:
            (app / "public" / name).write_text("source " + name)
            (app / "dist/client" / name).write_text("source " + name)
        (app / "dist/client/.assetsignore").write_text("wrangler.json\n.dev.vars\n")
        (app / "dist/client/assets/entry.js").write_text("export const hydrated = true")
        (app / "dist/native/index.js").write_text("export default {fetch(){return new Response('fixture')}}")
        # Source-faithful JSON projection: normalized defaults survive the adapter
        # spread; getOutputConfig overwrites main/no_bundle/rules/asset directory.
        config = {
            "name": "tuturuuu-apps-vite-staging", "topLevelName": "tuturuuu-apps-vite-staging",
            "compatibility_date": "2026-10-12", "compatibility_flags": ["nodejs_compat"],
            "workers_dev": True, "observability": {"enabled": True, "head_sampling_rate": 0.05},
            "vars": {"TUTURUUU_NOINDEX": "1"}, "definedEnvironments": [],
            "configPath": str(app / ".void-wrangler.jsonc"), "userConfigPath": str(app / ".void-wrangler.jsonc"),
            "main": "index.js", "no_bundle": True,
            "rules": [{"type": "ESModule", "globs": ["**/*.js", "**/*.mjs"]}],
            "assets": {"binding": "ASSETS", "directory": "../client", "run_worker_first": True, "not_found_handling": "none"},
            "jsx_factory": "React.createElement", "jsx_fragment": "React.Fragment", "triggers": {},
            "durable_objects": {"bindings": []}, "workflows": [], "migrations": [], "exports": {},
            "kv_namespaces": [], "cloudchamber": {}, "send_email": [],
            "queues": {"producers": [], "consumers": []}, "connect": [], "r2_buckets": [], "d1_databases": [],
            "vectorize": [], "ai_search_namespaces": [], "ai_search": [], "agent_memory": [], "hyperdrive": [],
            "services": [], "analytics_engine_datasets": [], "dispatch_namespaces": [], "mtls_certificates": [],
            "pipelines": [], "k2": [], "secrets_store_secrets": [], "artifacts": [], "unsafe_hello_world": [],
            "flagship": [], "worker_loaders": [], "ratelimits": [], "vpc_services": [], "vpc_networks": [],
            "logfwdr": {"bindings": []}, "python_modules": {"exclude": ["**/*.pyc"]},
            "dev": {"ip": "localhost", "local_protocol": "http", "upstream_protocol": "http", "enable_containers": True, "generate_types": False},
        }
        pointer = {"configPath": "../../dist/native/wrangler.json", "auxiliaryWorkers": []}
        self.save(app, config, pointer)
        return app, config, pointer

    def save(self, app, config, pointer):
        (app / "dist/native/wrangler.json").write_text(json.dumps(config))
        (app / artifact.REDIRECT).write_text(json.dumps(pointer))

    def test_real_adapter_metadata_and_relocated_seal_restore(self):
        app, _, _ = self.fixture()
        receipt = artifact.artifact(app, SHA)
        self.assertEqual(receipt["configPath"], "dist/native/wrangler.json")
        self.assertIn(artifact.REDIRECT, receipt["files"])
        receipt_path, archive = app / "receipt.json", app / "artifact.tar.gz"
        receipt_path.write_text(json.dumps(receipt))
        artifact.pack(app, receipt_path, archive, SHA)
        target = app / "fresh"
        target.mkdir()
        (target / "public").mkdir()
        for name in artifact.PUBLIC_FILES:
            (target / "public" / name).write_bytes((app / "public" / name).read_bytes())
        artifact.restore(target, archive, app / "restored.json", SHA)
        artifact.verify(target, receipt, SHA)
        self.assertEqual(json.loads((target / "dist/native/wrangler.json").read_text())["configPath"], str(app / ".void-wrangler.jsonc"))
        self.assertEqual((target / "dist/native/index.js").read_bytes(), (app / "dist/native/index.js").read_bytes())

    def test_required_empty_auxiliary_workers(self):
        for value in (None, {}, "", ["extra-worker"]):
            with self.subTest(value=value):
                app, config, pointer = self.fixture()
                pointer["auxiliaryWorkers"] = value
                self.save(app, config, pointer)
                with self.assertRaises(ValueError):
                    artifact.validate_output(app)
        app, config, pointer = self.fixture()
        del pointer["auxiliaryWorkers"]
        self.save(app, config, pointer)
        with self.assertRaises(ValueError):
            artifact.validate_output(app)

    def test_exact_owning_emitter_overrides_are_required(self):
        changes = [
            lambda c: c.pop("no_bundle"), lambda c: c.update(no_bundle=False),
            lambda c: c.pop("rules"), lambda c: c.update(rules=[]),
            lambda c: c["rules"][0].update(type="CommonJS"),
            lambda c: c["rules"][0].update(globs=["**/*.js"]),
            lambda c: c["rules"][0]["globs"].append("../../outside.js"),
            lambda c: c["rules"].append({"type": "Text", "globs": ["**/*"]}),
            lambda c: c.update(queues={"producers": [{"binding": "NEW", "queue": "new"}], "consumers": []}),
            lambda c: c.update(durable_objects={"bindings": [{"name": "NEW", "class_name": "New"}]}),
            lambda c: c.update(agent_memory=[{"binding": "NEW"}]),
        ]
        for mutate in changes:
            app, config, pointer = self.fixture()
            mutate(config)
            self.save(app, config, pointer)
            with self.assertRaises(ValueError):
                artifact.validate_output(app)

    def test_config_containment_identity_resources_and_static_controls(self):
        mutations = [
            lambda c: c.update(name="guessed-canonical-worker"),
            lambda c: c.update(account_id="unverified-account"),
            lambda c: c.update(routes=[{"pattern": "apps.tuturuuu.com", "custom_domain": True}]),
            lambda c: c.update(services=[{"binding": "OTHER", "service": "other"}]),
            lambda c: c.update(vectorize=[{"binding": "INDEX", "index_name": "new"}]),
            lambda c: c.update(secrets={"required": ["NEW_SECRET"]}),
            lambda c: c.update(vars={"TUTURUUU_NOINDEX": "0"}),
            lambda c: c.update(vars={"TUTURUUU_NOINDEX": "1", "APPS_CANONICAL_HOST_ENABLED": "1"}),
            lambda c: c.update(no_bundle=False),
            lambda c: c.update(workers_dev=1),
            lambda c: c.update(unknown_binding={"id": "unreviewed"}),
            lambda c: c["assets"].update(run_worker_first=False),
            lambda c: c["assets"].update(not_found_handling="single-page-application"),
            lambda c: c["assets"].update(directory="../../public"),
            lambda c: c.update(main="../../../package.json"),
        ]
        for mutate in mutations:
            app, config, pointer = self.fixture()
            mutate(config)
            self.save(app, config, pointer)
            with self.assertRaises(ValueError):
                artifact.validate_output(app)

    def test_pointer_escape_and_symlink_rejected(self):
        app, config, pointer = self.fixture()
        pointer["configPath"] = "../../../outside.json"
        self.save(app, config, pointer)
        with self.assertRaises(ValueError):
            artifact.validate_output(app)
        app, _, _ = self.fixture()
        (app / "dist/client/linked").symlink_to(app / "public", target_is_directory=True)
        with self.assertRaises(ValueError):
            artifact.artifact(app, SHA)

    def test_seal_detects_sha_changed_removed_extra_and_secret_files(self):
        for action in ("changed", "removed", "extra", "env"):
            app, _, _ = self.fixture()
            receipt = artifact.artifact(app, SHA)
            if action == "changed":
                (app / "dist/native/index.js").write_text("changed")
            elif action == "removed":
                (app / "dist/native/index.js").unlink()
            elif action == "extra":
                (app / "dist/client/extra.js").write_text("extra")
            else:
                (app / "dist/.env").write_text("fixture only")
            with self.assertRaises((ValueError, FileNotFoundError)):
                artifact.verify(app, receipt, SHA)
        app, _, _ = self.fixture()
        with self.assertRaises(ValueError):
            artifact.verify(app, artifact.artifact(app, SHA), "b" * 40)

    def test_restore_refuses_extra_traversal_symlink_and_source_overwrite(self):
        for name, kind in (("../outside", "file"), ("package.json", "file"), ("dist/link", "link"), ("dist/extra.js", "file")):
            app, _, _ = self.fixture()
            receipt = artifact.artifact(app, SHA)
            # Start from the complete positive artifact. Source overwrite must
            # reach the owned-output fence even with a self-consistent receipt.
            if name == "package.json":
                receipt["files"][name] = hashlib.sha256(b"x").hexdigest()
            receipt_bytes = json.dumps(receipt).encode()
            archive = app / "bad.tar.gz"
            with tarfile.open(archive, "w:gz") as tar:
                info = tarfile.TarInfo(artifact.RECEIPT)
                info.size = len(receipt_bytes)
                tar.addfile(info, io.BytesIO(receipt_bytes))
                for original in receipt["files"]:
                    if original == name:
                        continue
                    payload = (app / original).read_bytes()
                    original_info = tarfile.TarInfo(original)
                    original_info.size = len(payload)
                    tar.addfile(original_info, io.BytesIO(payload))
                info = tarfile.TarInfo(name)
                if kind == "link":
                    info.type, info.linkname = tarfile.SYMTYPE, "../../package.json"
                    tar.addfile(info)
                else:
                    info.size = 1
                    tar.addfile(info, io.BytesIO(b"x"))
            target = app / "fresh"
            target.mkdir()
            with self.assertRaises(ValueError):
                artifact.restore(target, archive, app / "receipt.json", SHA)
            self.assertFalse((target / "dist").exists())
            self.assertFalse((app / "outside").exists())


if __name__ == "__main__":
    unittest.main()
