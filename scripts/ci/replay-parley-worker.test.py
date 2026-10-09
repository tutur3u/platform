"""Focused offline tests: no Worker, namespace, service, or network is started."""

import importlib.util
import io
import json
import os
from pathlib import Path
import signal
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
