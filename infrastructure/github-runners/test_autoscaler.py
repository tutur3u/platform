import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import autoscaler as scaler


class AutoscalerTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.config = json.loads(Path(__file__).with_name("config.example.json").read_text())
        self.config["state_dir"] = self.directory.name

    def test_never_provisions_for_fork_or_pull_request_jobs(self):
        for event, repo in [("pull_request", "tutur3u/platform"), ("push", "attacker/platform"),
                            ("pull_request_target", "tutur3u/platform")]:
            with self.subTest(event=event), patch.object(scaler, "pages", return_value=iter([
                {"event": event, "head_repository": {"full_name": repo}, "id": 1}
            ])):
                self.assertEqual(scaler.queued_jobs("tutur3u/platform", "tuturuuu-linux"), 0)

    def test_running_workflows_with_queued_matrix_jobs_are_counted(self):
        run = {"event": "push", "head_repository": {"full_name": "tutur3u/platform"}, "id": 1}
        jobs = [{"status": "queued", "labels": ["tuturuuu-linux"]},
                {"status": "queued", "labels": ["tuturuuu-linux", "ARM64"]},
                {"status": "in_progress", "labels": ["tuturuuu-linux"]}]
        def values(path, key):
            return iter(jobs if key == "jobs" else ([] if "status=queued" in path else [run]))
        with patch.object(scaler, "pages", side_effect=values):
            self.assertEqual(scaler.queued_jobs("tutur3u/platform", "tuturuuu-linux"), 1)

    def test_busy_runners_survive_idle_timeout_and_pool_is_capped(self):
        runners = [{"name": "busy", "busy": True, "id": 1}]
        container = {"name": "busy", "state": {"Running": True}, "age": 3600}
        with patch.object(scaler, "pages", return_value=iter(runners)), \
             patch.object(scaler, "containers", return_value=[container]), \
             patch.object(scaler, "queued_jobs", return_value=20), \
             patch.object(scaler, "room", return_value=True), \
             patch.object(scaler, "start") as start, patch.object(scaler, "retire") as retire:
            scaler.tick(self.config)
            self.assertEqual(start.call_count, 3)
            retire.assert_not_called()

    def test_idle_starting_runners_prevent_duplicate_scale_up(self):
        container = {"name": "starting", "state": {"Running": True}, "age": 5}
        with patch.object(scaler, "pages", return_value=iter([])), \
             patch.object(scaler, "containers", return_value=[container]), \
             patch.object(scaler, "queued_jobs", return_value=1), patch.object(scaler, "start") as start:
            scaler.tick(self.config)
            start.assert_not_called()

    def test_deregistration_failure_does_not_destroy_container(self):
        with patch.object(scaler, "remove_runner", return_value=False), \
             patch.object(scaler, "command") as command:
            self.assertFalse(scaler.retire(self.config, {"labels": {"tuturuuu.runner-id": "1"}}))
            command.assert_not_called()

    def test_memory_pressure_prevents_scale_up(self):
        with patch.object(scaler, "pages", return_value=iter([])), \
             patch.object(scaler, "containers", return_value=[]), \
             patch.object(scaler, "queued_jobs", return_value=3), \
             patch.object(scaler, "room", return_value=False), patch.object(scaler, "start") as start:
            scaler.tick(self.config)
            start.assert_not_called()


if __name__ == "__main__":
    unittest.main()
