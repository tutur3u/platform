"""Focused offline tests: no Worker, namespace, service, or network is started."""

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import shutil
import stat
import subprocess
import tempfile
import unittest
from unittest.mock import Mock, patch
import zipfile

SPEC = importlib.util.spec_from_file_location("replay", Path(__file__).with_name("replay-parley-worker.py"))
REPLAY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPLAY)


class Safeguards(unittest.TestCase):
    def metadata(self):
        return {"id": REPLAY.ARTIFACT, "name": f"parley-worker-{REPLAY.SOURCE}",
                "expired": False, "digest": f"sha256:{REPLAY.DIGEST}",
                "workflow_run": {"id": REPLAY.RUN, "head_sha": REPLAY.SOURCE, "head_branch": "production"}}

    def test_exact_producer_and_digest(self):
        REPLAY.validate_metadata(self.metadata())
        for field, value in (("expired", True), ("digest", "sha256:wrong"), ("id", 1), ("name", "latest")):
            data = self.metadata()
            data[field] = value
            with self.assertRaises(RuntimeError):
                REPLAY.validate_metadata(data)
        data = self.metadata()
        data["workflow_run"]["head_sha"] = "other"
        with self.assertRaises(RuntimeError):
            REPLAY.validate_metadata(data)

    def archive(self, name, mode=stat.S_IFREG | 0o644):
        data = io.BytesIO()
        with zipfile.ZipFile(data, "w") as bundle:
            entry = zipfile.ZipInfo(name)
            entry.external_attr = mode << 16
            bundle.writestr(entry, b"fixture")
        data.seek(0)
        return data

    def test_safe_exclusive_extraction(self):
        with tempfile.TemporaryDirectory() as parent:
            destination = Path(parent) / "new"
            REPLAY.extract(self.archive("nested/worker.js"), destination)
            self.assertEqual((destination / "nested/worker.js").read_bytes(), b"fixture")
            self.assertEqual(stat.S_IMODE((destination / "nested/worker.js").stat().st_mode), 0o600)
            with self.assertRaises(FileExistsError):
                REPLAY.extract(self.archive("other"), destination)

    def test_unsafe_paths_and_symlink_rejected_before_creation(self):
        for name, mode in (("../escape", stat.S_IFREG), ("/absolute", stat.S_IFREG),
                           ("a\\b", stat.S_IFREG), ("link", stat.S_IFLNK)):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as parent:
                destination = Path(parent) / "new"
                with self.assertRaises(RuntimeError):
                    REPLAY.extract(self.archive(name, mode), destination)
                self.assertFalse(destination.exists())

    def tool_fixture(self, root):
        app = root / "apps/parley"
        wrangler = app / "node_modules/wrangler"
        workerd = wrangler / "node_modules/workerd"
        esbuild = wrangler / "node_modules/esbuild"
        files = {
            app / "package.json": '{"name":"@tuturuuu/parley"}',
            wrangler / "package.json": '{"name":"wrangler","version":"4.131.1","exports":{"./package.json":"./package.json"}}',
            wrangler / "bin/wrangler.js": "throw new Error('must not execute wrapper');",
            workerd / "package.json": '{"name":"workerd","version":"1.20260911.1","main":"index.js"}',
            workerd / "index.js": "throw new Error('must not import workerd');",
            esbuild / "package.json": '{"name":"esbuild","main":"index.js"}',
            esbuild / "index.js": "throw new Error('must not import esbuild');",
            workerd / "node_modules/@cloudflare/workerd-linux-64/bin/workerd": "native fixture",
            esbuild / "node_modules/@esbuild/linux-x64/bin/esbuild": "native fixture",
        }
        for path, value in files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value)
        return files

    def test_filtered_workspace_resolves_nested_tools_without_imports(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            self.tool_fixture(root)
            tools = REPLAY.resolve_tools(root, shutil.which("node"))
            self.assertFalse((root / "node_modules/wrangler").exists())
            self.assertIn("apps/parley/node_modules/wrangler", tools["wrangler"]["path"])
            self.assertIn("node_modules/workerd/node_modules/@cloudflare", tools["workerd"]["path"])
            self.assertIn("node_modules/esbuild/node_modules/@esbuild", tools["esbuild"]["path"])
            self.assertEqual(set(tools), {"node", "parleyManifest", "wranglerManifest", "workerdManifest",
                                          "esbuildManifest", "wrangler", "workerd", "esbuild"})

    def test_missing_native_dependency_stops_without_tool_fallback(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            files = self.tool_fixture(root)
            next(path for path in files if "@cloudflare" in str(path)).unlink()
            with self.assertRaises(subprocess.CalledProcessError):
                REPLAY.resolve_tools(root, shutil.which("node"))

    def test_resolved_tool_cannot_escape_immutable_checkout(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent) / "checkout"
            self.tool_fixture(root)
            app = root / "apps/parley/package.json"
            with patch.object(REPLAY.subprocess, "check_output", return_value=json.dumps({
                    "parleyManifest": str(app), "wranglerManifest": str(app), "workerdManifest": str(app),
                    "esbuildManifest": str(app), "wrangler": str(app), "workerd": str(app),
                    "esbuild": __file__})):
                with self.assertRaisesRegex(RuntimeError, "outside immutable checkout"):
                    REPLAY.resolve_tools(root, shutil.which("node"))

    def asset_fixture(self, root):
        hashes = {}
        for name in REPLAY.ASSET_HASHES:
            target = root / ("server-functions/default/" + REPLAY.NEXT_OG + name)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            target.write_bytes(name.encode())
            target.chmod(0o600)
            hashes[name] = hashlib.sha256(name.encode()).hexdigest()
        for relative, names, prefix in [
            ("middleware/handler.mjs", ["resvg.wasm", "yoga.wasm"], REPLAY.PRODUCER_ROOT),
            ("server-functions/default/apps/parley/handler.mjs", ["Geist-Regular.ttf.bin"], REPLAY.PRODUCER_ROOT + "apps/parley/.open-next/server-functions/default/"),
            ("server-functions/default/apps/parley/.next/server/chunks/[turbopack]_runtime.js", ["resvg.wasm", "yoga.wasm"], REPLAY.PRODUCER_ROOT + "apps/parley/.open-next/server-functions/default/"),
        ]:
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            target.write_text("\n".join(json.dumps(prefix + REPLAY.NEXT_OG + name) for name in names))
            target.chmod(0o600)
        for directory in root.rglob("*"):
            if directory.is_dir(): directory.chmod(0o700)
        return hashes

    def test_asset_bindings_preserve_originals_and_are_exclusive(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            hashes = self.asset_fixture(root)
            before = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            with patch.object(REPLAY, "ASSET_HASHES", hashes):
                records = REPLAY.bind_retained_assets(root)
                self.assertEqual(len(records), 15)
                with self.assertRaises(FileExistsError):
                    REPLAY.bind_retained_assets(root)
            self.assertTrue(all((root / name).read_bytes() == data for name, data in before.items()))
            self.assertTrue(all(Path(r["path"]).is_relative_to(root.resolve()) for r in records))

    def test_asset_path_traversal_and_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            for relative in ("../escape", "/outside", "a/../b", "a\\b", "a//b"):
                with self.assertRaises(RuntimeError):
                    REPLAY.private_path(root, relative, True)
            (root / "link").symlink_to(Path(parent).parent)
            with self.assertRaises(RuntimeError):
                REPLAY.private_path(root, "link/outside", True)

    def test_asset_hash_import_and_mode_fail_before_aliases(self):
        for error in ("hash", "import", "mode", "symlink", "missing"):
            with self.subTest(error=error), tempfile.TemporaryDirectory() as parent:
                root = Path(parent)
                hashes = self.asset_fixture(root)
                asset = root / ("server-functions/default/" + REPLAY.NEXT_OG + "resvg.wasm")
                if error == "hash": asset.write_bytes(b"wrong")
                elif error == "import": (root / "middleware/handler.mjs").write_text("unrelated")
                elif error == "mode": asset.chmod(0o644)
                elif error == "symlink":
                    asset.unlink()
                    asset.symlink_to(root / "middleware/handler.mjs")
                else: asset.unlink()
                with patch.object(REPLAY, "ASSET_HASHES", hashes), self.assertRaises((RuntimeError, FileNotFoundError)):
                    REPLAY.bind_retained_assets(root)
                self.assertFalse((root / "middleware/home").exists())

    def test_request_failures_cannot_qualify_but_http500_is_captured(self):
        for error in (TimeoutError(), ConnectionError()):
            connection = Mock()
            connection.getresponse.side_effect = error
            result = {}
            with patch.object(REPLAY.http.client, "HTTPConnection", return_value=connection):
                REPLAY.request_once(result)
            self.assertFalse(REPLAY.response_complete(result))
            self.assertTrue(result["done"])
        self.assertFalse(REPLAY.response_complete({"done": True}))
        self.assertTrue(REPLAY.response_complete({"done": True, "httpStatus": 500}))

    def test_environment_drops_tokens_and_caller_home(self):
        with patch.dict(os.environ, {"GH_TOKEN": "private", "CLOUDFLARE_API_TOKEN": "private"}):
            env = REPLAY.clean_environment(Path("/private/fixture"), "/tools/node")
        self.assertNotIn("GH_TOKEN", env)
        self.assertNotIn("CLOUDFLARE_API_TOKEN", env)
        self.assertEqual(env["HOME"], "/private/fixture/state/home")

    def test_cleanup_escalates_then_waits_and_drains(self):
        process = Mock(pid=123)
        drain = Mock()
        clock = iter([0, 6, 6, 7, 7])
        with patch.object(REPLAY, "group_absent", side_effect=[False, False, True, True]), \
                patch.object(REPLAY.os, "killpg") as kill, \
                patch.object(REPLAY.time, "monotonic", side_effect=lambda: next(clock)), \
                patch.object(REPLAY.time, "sleep"):
            REPLAY.close_group(process, drain, 60)
        self.assertEqual(kill.call_args_list[0].args, (123, signal.SIGTERM))
        self.assertEqual(kill.call_args_list[1].args, (123, signal.SIGKILL))
        process.wait.assert_called_once()
        self.assertTrue(drain.called)

    def test_cleanup_failure_is_not_success(self):
        process = Mock(pid=123)
        with patch.object(REPLAY, "group_absent", return_value=False), \
                patch.object(REPLAY.os, "killpg"), \
                patch.object(REPLAY.time, "monotonic", side_effect=[0, 6, 6, 12, 12]):
            with self.assertRaisesRegex(RuntimeError, "remains"):
                REPLAY.close_group(process, Mock(), 60)

    def test_isolation_failure_prevents_worker_start(self):
        plan = {"tools": {}, "archive": {"path": "archive"}, "worker": {"path": "worker"}, "config": {"path": "config"}}
        with patch.object(REPLAY, "read_json", return_value=plan), \
                patch.object(REPLAY, "identity", side_effect=lambda path: {"path": path}), \
                patch.object(REPLAY, "isolation", side_effect=RuntimeError("Network namespace missing")), \
                patch.object(REPLAY.subprocess, "Popen") as popen:
            with self.assertRaisesRegex(RuntimeError, "namespace missing"):
                REPLAY.run(Path("/unused"))
        popen.assert_not_called()

    def test_failed_startup_preserves_primary_and_cleanup_failure(self):
        plan = {"tools": {"node": {"path": "node"}, "wrangler": {"path": "wrangler"}},
                "archive": {"path": "archive"}, "worker": {"path": "worker"}, "config": {"path": "config"}}
        process = Mock(pid=123)
        process.poll.return_value = 1
        selector = Mock()
        selector.select.return_value = []
        selector.get_map.return_value = {}
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            with patch.object(REPLAY, "read_json", side_effect=lambda path: plan if path.name == "plan.json" else {}), \
                    patch.object(REPLAY, "identity", side_effect=lambda path: {"path": path}), \
                    patch.object(REPLAY, "isolation", return_value={}), \
                    patch.object(REPLAY.os, "chown"), patch.object(REPLAY.subprocess, "run"), \
                    patch.object(REPLAY.subprocess, "Popen", return_value=process), \
                    patch.object(REPLAY.selectors, "DefaultSelector", return_value=selector), \
                    patch.object(REPLAY.signal, "signal"), \
                    patch.object(REPLAY, "close_group", side_effect=RuntimeError("group remains")) as close:
                self.assertEqual(REPLAY.run(root), 1)
            result = json.loads((root / "diagnostic-result.json").read_bytes())
            self.assertEqual(result["requests"], 0)
            self.assertEqual(result["primaryError"], "LOCAL_TOOL_OR_BINDING_STARTUP_GAP")
            self.assertEqual(result["cleanupError"], "group remains")
            close.assert_called_once()

    def test_cleanup_deadline_is_absolute(self):
        process = Mock(pid=123)
        with patch.object(REPLAY, "group_absent", return_value=False), \
                patch.object(REPLAY.os, "killpg") as kill, \
                patch.object(REPLAY.time, "monotonic", return_value=60):
            with self.assertRaisesRegex(RuntimeError, "deadline exhausted"):
                REPLAY.close_group(process, Mock(), 60)
        self.assertEqual(kill.call_args_list[-1].args, (123, signal.SIGKILL))
        process.wait.assert_not_called()

    def test_late_preparation_refuses_worker_launch(self):
        plan = {"tools": {"node": {"path": "node"}, "wrangler": {"path": "wrangler"}},
                "archive": {"path": "archive"}, "worker": {"path": "worker"}, "config": {"path": "config"}}
        selector = Mock()
        selector.get_map.return_value = {}
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            with patch.object(REPLAY, "read_json", side_effect=lambda path: plan if path.name == "plan.json" else {}), \
                    patch.object(REPLAY, "identity", side_effect=lambda path: {"path": path}), \
                    patch.object(REPLAY, "isolation", return_value={}), \
                    patch.object(REPLAY.os, "chown"), patch.object(REPLAY.subprocess, "run"), \
                    patch.object(REPLAY.subprocess, "Popen") as popen, \
                    patch.object(REPLAY.selectors, "DefaultSelector", return_value=selector), \
                    patch.object(REPLAY.signal, "signal"), \
                    patch.object(REPLAY.time, "monotonic", side_effect=[0, 51, 51, 51]):
                self.assertEqual(REPLAY.run(root), 1)
            popen.assert_not_called()
            self.assertIn("before launch", json.loads((root / "diagnostic-result.json").read_bytes())["primaryError"])

    def test_cleanup_log_overflow_cannot_pass(self):
        plan = {"tools": {"node": {"path": "node"}, "wrangler": {"path": "wrangler"}},
                "archive": {"path": "archive"}, "worker": {"path": "worker"}, "config": {"path": "config"}}
        process = Mock(pid=123, returncode=0)
        process.poll.return_value = None
        selector = Mock()
        selector.select.return_value = []
        selector.get_map.return_value = {}
        def request(result):
            result["done"] = True
        def cleanup(_process, drain, _deadline):
            selector.select.return_value = [(Mock(fileobj=Mock()), None)]
            with patch.object(REPLAY.os, "read", return_value=b"x" * (REPLAY.LOG_LIMIT + 1)):
                drain()
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            with patch.object(REPLAY, "read_json", side_effect=lambda path: plan if path.name == "plan.json" else {}), \
                    patch.object(REPLAY, "identity", side_effect=lambda path: {"path": path}), \
                    patch.object(REPLAY, "isolation", return_value={}), \
                    patch.object(REPLAY.os, "chown"), patch.object(REPLAY.subprocess, "run"), \
                    patch.object(REPLAY.subprocess, "Popen", return_value=process), \
                    patch.object(REPLAY.selectors, "DefaultSelector", return_value=selector), \
                    patch.object(REPLAY.signal, "signal"), \
                    patch.object(REPLAY.socket, "create_connection"), \
                    patch.object(REPLAY, "request_once", side_effect=request), \
                    patch.object(REPLAY, "close_group", side_effect=cleanup):
                self.assertEqual(REPLAY.run(root), 1)
            self.assertTrue(json.loads((root / "diagnostic-result.json").read_bytes())["logOverflow"])

    def test_error_lines_redact_credentials_and_urls(self):
        lines = REPLAY.diagnostic_lines(b"Error: offline-secret https://example.invalid?q=private\nError: Authorization: private\n  at handler.mjs:123:4")
        self.assertNotIn("offline-secret", json.dumps(lines))
        self.assertNotIn("q=private", json.dumps(lines))
        self.assertNotIn("Authorization", json.dumps(lines))
        self.assertIn("handler.mjs", json.dumps(lines))

    def test_request_is_once_and_never_follows_redirect(self):
        connection = Mock()
        connection.getresponse.return_value.status = 302
        connection.getresponse.return_value.read.return_value = b"redirect"
        result = {}
        with patch.object(REPLAY.http.client, "HTTPConnection", return_value=connection):
            REPLAY.request_once(result)
        connection.request.assert_called_once()
        self.assertEqual(connection.request.call_args.args[:2], ("GET", "/access-denied"))
        self.assertEqual(result["httpStatus"], 302)
        connection.close.assert_called_once()

    def run_isolation_step(self, capability_status=0, timeout_status=0, environment="github-hosted"):
        workflow = Path(__file__).parents[2] / ".github/workflows/parley-offline-diagnostic.yaml"
        text = workflow.read_text().split("      - name: Check ephemeral runner isolation\n", 1)[1]
        block = text.split("        run: |\n", 1)[1].split("      - name:", 1)[0]
        script = "\n".join(line[10:] for line in block.splitlines())
        with tempfile.TemporaryDirectory() as parent:
            root = Path(parent)
            stubs = {
                "sudo": '''#!/bin/bash
[[ "$*" == "-n unshare --mount --net --propagation private true" ]] && exit 0
if [[ "$*" == "-n systemctl stop parley-capability-123-1" ]]; then printf "capability cleanup\\n"; exit 0; fi
[[ "$1 $2 $3" == "-n systemd-run --unit=parley-capability-123-1" ]] || exit 97
for flag in --wait --collect --pipe MemoryMax=17179869184 CPUQuota=1000% TasksMax=256 PrivateNetwork=yes RuntimeMaxSec=20 TimeoutStopSec=2 KillMode=control-group; do
  [[ " $* " == *" $flag "* ]] || exit 98
done
[[ "$*" == *"/usr/bin/unshare --mount --net --propagation private /usr/bin/python3 -B -c"* ]] || exit 99
[[ "$*" == *'m.isolation({"outerNet":sys.argv[2],"outerMount":sys.argv[3]})'* ]] || exit 96
[[ "$*" == *"/control/scripts/ci/replay-parley-worker.py net:[fixture] mnt:[fixture]" ]] || exit 95
exit "$MOCK_CAPABILITY_STATUS"
''',
                "readlink": '#!/bin/bash\nprintf "%s:[fixture]\\n" "${1##*/}"\n',
                "timeout": '#!/bin/bash\n[[ "$1 $2" == "--signal=TERM --kill-after=2s" ]] || exit 97\nif [[ "$3" == 27s ]]; then [[ "$MOCK_TIMEOUT_STATUS" == 0 ]] || exit "$MOCK_TIMEOUT_STATUS"; else [[ "$3" == 5s ]] || exit 97; fi\nshift 3\nexec "$@"\n',
                "systemctl": '#!/bin/bash\nexit 94\n',
            }
            for name, source in stubs.items():
                path = root / name
                path.write_text(source)
                path.chmod(0o700)
            return subprocess.run(["/bin/bash", "-e", "-c", script], capture_output=True, text=True,
                                  env={"PATH": f"{root}:/usr/bin:/bin", "RUNNER_ENVIRONMENT": environment,
                                       "GITHUB_RUN_ID": "123", "GITHUB_RUN_ATTEMPT": "1", "GITHUB_WORKSPACE": "/fixture",
                                       "MOCK_CAPABILITY_STATUS": str(capability_status),
                                       "MOCK_TIMEOUT_STATUS": str(timeout_status)})

    def test_ephemeral_capability_does_not_wait_for_whole_host_boot(self):
        result = self.run_isolation_step()
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_ephemeral_capability_failure_and_timeout_stop(self):
        for capability, timeout in ((1, 0), (0, 124), (0, 137)):
            with self.subTest(capability=capability, timeout=timeout):
                result = self.run_isolation_step(capability, timeout)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("capability cleanup", result.stdout)

    def test_self_hosted_runner_stops_before_capability(self):
        self.assertNotEqual(self.run_isolation_step(environment="self-hosted").returncode, 0)

    def test_source_workflow_has_no_automatic_or_deploy_entry(self):
        workflow = Path(__file__).parents[2] / ".github/workflows/parley-offline-diagnostic.yaml"
        text = workflow.read_text()
        self.assertNotIn("pull_request:", text)
        self.assertNotIn("push:", text)
        self.assertIn("unshare --mount --net --propagation private", text)
        self.assertNotIn("secrets.", text)
        self.assertNotIn("wrangler deploy", text)


if __name__ == "__main__":
    unittest.main()
