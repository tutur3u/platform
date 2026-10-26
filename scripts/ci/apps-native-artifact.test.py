"""Source-only artifact regressions; no app/compiler/runtime required."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock

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
            "main": "index.js", "no_bundle": True, "upload_source_maps": True,
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
        app, config, _ = self.fixture()
        self.assertIs(config["upload_source_maps"], True)
        config_path = app / "dist/native/wrangler.json"
        config_bytes = b" \n" + json.dumps(config, indent=2).encode() + b"\n"
        config_path.write_bytes(config_bytes)
        receipt = artifact.artifact(app, SHA)
        self.assertEqual(receipt["configPath"], "dist/native/wrangler.json")
        self.assertIn(artifact.REDIRECT, receipt["files"])
        self.assertEqual(config_path.read_bytes(), config_bytes)
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
        self.assertEqual((target / "dist/native/wrangler.json").read_bytes(), config_bytes)
        self.assertIs(json.loads((target / "dist/native/wrangler.json").read_bytes())["upload_source_maps"], True)
        self.assertEqual(json.loads((target / "dist/native/wrangler.json").read_text())["configPath"], str(app / ".void-wrangler.jsonc"))
        self.assertEqual((target / "dist/native/index.js").read_bytes(), (app / "dist/native/index.js").read_bytes())

    def use_saved_pointer(self, app):
        native = app / artifact.REDIRECT
        saved = app / artifact.SAVED_REDIRECT
        saved.parent.mkdir(exist_ok=True)
        saved.write_bytes(native.read_bytes())
        native.unlink()
        return saved

    def test_saved_pointer_native_base_and_exact_bytes_survive_restore(self):
        app, _, _ = self.fixture()
        saved = self.use_saved_pointer(app)
        payload = b" \n" + saved.read_bytes() + b"\n"
        saved.write_bytes(payload)
        receipt = artifact.artifact(app, SHA)
        self.assertEqual(receipt["configPath"], "dist/native/wrangler.json")
        self.assertEqual(receipt["files"][artifact.SAVED_REDIRECT], hashlib.sha256(payload).hexdigest())
        self.assertNotIn(artifact.REDIRECT, receipt["files"])
        receipt_path, archive = app / "receipt.json", app / "artifact.tar.gz"
        receipt_path.write_text(json.dumps(receipt))
        artifact.pack(app, receipt_path, archive, SHA)
        with tarfile.open(archive) as packed:
            self.assertEqual(packed.extractfile(artifact.SAVED_REDIRECT).read(), payload)
            self.assertNotIn(artifact.REDIRECT, packed.getnames())
        target = app / "fresh"
        target.mkdir()
        (target / "public").mkdir()
        for name in artifact.PUBLIC_FILES:
            (target / "public" / name).write_bytes((app / "public" / name).read_bytes())
        artifact.restore(target, archive, app / "restored.json", SHA)
        artifact.verify(target, receipt, SHA)
        self.assertEqual((target / artifact.SAVED_REDIRECT).read_bytes(), payload)
        self.assertFalse((target / artifact.REDIRECT).exists())
        (target / artifact.SAVED_REDIRECT).write_bytes(payload + b" ")
        with self.assertRaises(ValueError):
            artifact.verify(target, receipt, SHA)

    def test_pointer_candidate_count_includes_dangling_links(self):
        for mode in ("missing", "both", "dangling-other", "dangling-only", "directory", "file-link"):
            with self.subTest(mode=mode):
                app, _, _ = self.fixture()
                native, saved = app / artifact.REDIRECT, app / artifact.SAVED_REDIRECT
                saved.parent.mkdir()
                if mode == "both":
                    saved.write_bytes(native.read_bytes())
                elif mode == "dangling-other":
                    saved.symlink_to(app / "absent")
                elif mode == "file-link":
                    payload = app / "pointer-payload.json"
                    payload.write_bytes(native.read_bytes())
                    saved.symlink_to(payload)
                    native.unlink()
                    self.assertTrue(payload.is_file())
                    self.assertFalse(payload.is_symlink())
                    self.assertTrue(saved.is_symlink())
                    self.assertFalse(native.exists())
                else:
                    native.unlink()
                    if mode == "dangling-only":
                        saved.symlink_to(app / "absent")
                    elif mode == "directory":
                        saved.mkdir()
                expected = {
                    "missing": "exactly one native/saved deploy pointer required",
                    "both": "exactly one native/saved deploy pointer required",
                    "dangling-other": "exactly one native/saved deploy pointer required",
                    "dangling-only": "artifact symlink forbidden",
                    "directory": "deploy pointer must be a regular file",
                    "file-link": "artifact symlink forbidden",
                }[mode]
                with self.assertRaisesRegex(ValueError, "^" + expected + "$"):
                    artifact.artifact(app, SHA)

    def test_saved_pointer_ancestors_and_regular_target_required(self):
        for name in (".void", ".wrangler", ".wrangler/deploy"):
            for mode in ("symlink", "file"):
                with self.subTest(name=name, mode=mode):
                    app, _, _ = self.fixture()
                    self.use_saved_pointer(app)
                    path = app / name
                    if path.name == ".void":
                        (path / "preview-deploy-config.json").unlink()
                    if path.name == ".wrangler":
                        (path / "deploy").rmdir()
                    path.rmdir()
                    if mode == "symlink":
                        path.symlink_to(app / "missing-directory", target_is_directory=True)
                    else:
                        path.write_text("not a directory")
                    with self.assertRaises(ValueError):
                        artifact.artifact(app, SHA)
        app, _, _ = self.fixture()
        saved = self.use_saved_pointer(app)
        saved.unlink()
        import os
        os.mkfifo(saved)
        with self.assertRaises(ValueError):
            artifact.artifact(app, SHA)

    def test_saved_pointer_retains_metadata_and_containment_guards(self):
        cases = ({"extra": True}, {"auxiliaryWorkers": ["extra"]},
                 {"configPath": "../../../outside.json"},
                 {"configPath": "/tmp/outside.json"},
                 {"configPath": "../dist/native/wrangler.json"})
        for change in cases:
            with self.subTest(change=change):
                app, _, _ = self.fixture()
                saved = self.use_saved_pointer(app)
                value = json.loads(saved.read_text())
                value.update(change)
                saved.write_text(json.dumps(value))
                with self.assertRaises(ValueError):
                    artifact.artifact(app, SHA)

    def test_restore_rechecks_ancestors_after_dist_move(self):
        for saved in (False, True):
            for ancestor in (".void", ".wrangler", ".wrangler/deploy"):
                with self.subTest(saved=saved, ancestor=ancestor):
                    app, _, _ = self.fixture()
                    if saved:
                        self.use_saved_pointer(app)
                    receipt = artifact.artifact(app, SHA)
                    receipt_path, archive = app / "receipt.json", app / "artifact.tar.gz"
                    receipt_path.write_text(json.dumps(receipt))
                    artifact.pack(app, receipt_path, archive, SHA)
                    expected_dist = {
                        path.relative_to(app / "dist"): path.read_bytes()
                        for path in (app / "dist").rglob("*") if path.is_file()
                    }
                    with tempfile.TemporaryDirectory() as destination, tempfile.TemporaryDirectory() as outside:
                        target, external = Path(destination), Path(outside)
                        restored_receipt = target / "receipt.json"
                        original_move = artifact.shutil.move
                        moved_dist = []

                        def move_then_replace_ancestor(source, destination):
                            result = original_move(source, destination)
                            if Path(destination) == target / "dist":
                                moved_dist.append(True)
                                link = target / ancestor
                                link.parent.mkdir(parents=True, exist_ok=True)
                                link.symlink_to(external, target_is_directory=True)
                            return result

                        (target / "public").mkdir(parents=True, exist_ok=True)
                        for name in artifact.PUBLIC_FILES:
                            (target / "public" / name).write_bytes((app / "public" / name).read_bytes())

                        with mock.patch.object(artifact.shutil, "move", side_effect=move_then_replace_ancestor):
                            with self.assertRaisesRegex(ValueError, "^redirect ancestor symlink forbidden$"):
                                artifact.restore(target, archive, restored_receipt, SHA)
                        self.assertEqual(moved_dist, [True])
                        self.assertTrue((target / ancestor).is_symlink())
                        self.assertEqual(list(external.iterdir()), [])
                        self.assertTrue(all(not (target / name).exists() for name in artifact.REDIRECTS))
                        self.assertFalse(restored_receipt.exists())
                        # Rejection leaves the moved dist intact; no rollback is promised.
                        self.assertEqual({
                            path.relative_to(target / "dist"): path.read_bytes()
                            for path in (target / "dist").rglob("*") if path.is_file()
                        }, expected_dist)

    def test_saved_restore_rejects_existing_candidates_and_ancestor_links(self):
        app, _, _ = self.fixture()
        self.use_saved_pointer(app)
        receipt = artifact.artifact(app, SHA)
        receipt_path, archive = app / "receipt.json", app / "artifact.tar.gz"
        receipt_path.write_text(json.dumps(receipt))
        artifact.pack(app, receipt_path, archive, SHA)
        for name in artifact.REDIRECTS + (".void", ".wrangler", ".wrangler/deploy"):
            with self.subTest(name=name):
                with tempfile.TemporaryDirectory() as temporary:
                    target = Path(temporary)
                    path = target / name
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.symlink_to(target / "absent")
                    with self.assertRaises(ValueError):
                        artifact.restore(target, archive, app / "restored.json", SHA)
                    self.assertFalse((target / "dist").exists())
                    self.assertTrue(path.is_symlink())

    def test_restore_rejects_self_consistent_archive_with_both_pointers(self):
        app, _, _ = self.fixture()
        self.use_saved_pointer(app)
        receipt = artifact.artifact(app, SHA)
        payload = (app / artifact.SAVED_REDIRECT).read_bytes()
        receipt["files"][artifact.REDIRECT] = hashlib.sha256(payload).hexdigest()
        archive = app / "dual.tar.gz"
        with tarfile.open(archive, "w:gz") as packed:
            for name in list(receipt["files"]) + [artifact.RECEIPT]:
                if name == artifact.RECEIPT:
                    data = json.dumps(receipt).encode()
                elif name == artifact.REDIRECT:
                    data = payload
                else:
                    data = (app / name).read_bytes()
                info = tarfile.TarInfo(name)
                info.size = len(data)
                packed.addfile(info, io.BytesIO(data))
        target = app / "fresh"
        target.mkdir()
        (target / "public").mkdir()
        for name in artifact.PUBLIC_FILES:
            (target / "public" / name).write_bytes((app / "public" / name).read_bytes())
        with self.assertRaises(ValueError):
            artifact.restore(target, archive, app / "restored.json", SHA)
        self.assertFalse((target / "dist").exists())
        self.assertFalse(any((target / name).exists() for name in artifact.REDIRECTS))

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

    def test_upload_source_maps_requires_exact_true_and_rejects_unrelated_fields(self):
        for value in (False, 1, None, "true", {}):
            with self.subTest(value=value):
                app, config, pointer = self.fixture()
                config["upload_source_maps"] = value
                self.save(app, config, pointer)
                config_path = app / "dist/native/wrangler.json"
                before = config_path.read_bytes()
                with self.assertRaisesRegex(ValueError, "contract drift: upload_source_maps"):
                    artifact.validate_output(app)
                self.assertEqual(config_path.read_bytes(), before)
        app, config, pointer = self.fixture()
        config["unrelated_key"] = True
        self.save(app, config, pointer)
        with self.assertRaisesRegex(ValueError, "unreviewed emitted config field"):
            artifact.validate_output(app)

    def test_html_only_as_a_declared_public_file(self):
        app, _, _ = self.fixture()
        for name in ("index.html", "assets/route.html", "nested/offline.html"):
            target = app / "dist/client" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text("<html></html>")
            with self.assertRaisesRegex(ValueError, "unreviewed static HTML"):
                artifact.validate_output(app)
            target.unlink()
        with mock.patch.object(artifact, "PUBLIC_FILES", (*artifact.PUBLIC_FILES, "offline.html")):
            (app / "public/offline.html").write_text("<html>offline</html>")
            (app / "dist/client/offline.html").write_text("<html>offline</html>")
            artifact.validate_output(app)
            (app / "dist/client/offline.html").write_text("<html>prerendered</html>")
            with self.assertRaisesRegex(ValueError, "public asset drift: offline.html"):
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
