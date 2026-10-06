"""Durability, idempotency, audit history and truthful completion regressions."""
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest

from program_backlog import connect, intake, records, snapshot, update


def request(key="repair"):
    return {"id": key, "title": "Repair upload", "kind": "bug", "priority": 0,
            "source": "user request", "acceptance": "Actual upload and reload succeeds",
            "dependencies": [], "requiredEvidence": ["focused", "runtime"]}


def proof(key="repair"):
    return {"version": 1, "units": [{"id": key, "owner": "worker", "worktree": ".worktrees/repair",
            "head": "a" * 40, "state": "merged", "requiredEvidence": ["focused", "runtime"],
            "evidence": [{"kind": k, "head": "a" * 40, "result": "pass", "receipt": "receipt/" + k}
                         for k in ["focused", "runtime"]]}]}


class BacklogTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / "private/backlog.sqlite"
        self.db = connect(self.path, initialize=True)

    def tearDown(self):
        self.db.close()
        self.directory.cleanup()

    def test_changed_duplicate_priority_requires_audited_update(self):
        intake(self.db, [dict(request(), priority=2)])
        with self.assertRaisesRegex(ValueError, "priority"):
            intake(self.db, [request()])
        self.assertEqual(records(self.db)["repair"]["priority"], 2)

    def test_reopening_parent_invalidates_transitive_verified_dependents(self):
        intake(self.db, [request(), dict(request("second"), dependencies=["repair"]),
                         dict(request("third"), dependencies=["second"])])
        for key in ["repair", "second", "third"]:
            update(self.db, key, status="verified", evidence=proof(key))
        update(self.db, "repair", status="active", owner="worker")
        self.assertEqual(snapshot(self.db)["counts"]["verified"], 0)
        for key in ["second", "third"]:
            self.assertEqual(records(self.db)[key]["status"], "implemented")
            self.assertNotIn("verification", records(self.db)[key])
            history = [json.loads(r[0]) for r in self.db.execute(
                "SELECT payload FROM events WHERE item_id=? ORDER BY seq", (key,))]
            self.assertIn("verification", history[-2])

    def test_cli_priority_update_is_audited_without_resetting_progress(self):
        intake(self.db, [dict(request(), priority=2)])
        update(self.db, "repair", status="active", owner="worker")
        command = [sys.executable, str(Path(__file__).with_name("program_backlog.py")),
                   "--db", str(self.path), "update", "repair", "--priority", "0"]
        result = subprocess.run(command, capture_output=True, text=True, check=True)
        self.assertEqual(json.loads(result.stdout)["priority"], 0)
        self.assertEqual(records(self.db)["repair"]["status"], "active")
        self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0], 3)
        for priority in [True, -1, 4]:
            with self.assertRaises(ValueError):
                update(self.db, "repair", priority=priority)
        self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0], 3)

    def test_reverified_parent_does_not_restore_dependent_old_receipt(self):
        intake(self.db, [request(), dict(request("second"), dependencies=["repair"])])
        update(self.db, "repair", status="verified", evidence=proof())
        update(self.db, "second", status="verified", evidence=proof("second"))
        update(self.db, "repair", status="blocked")
        update(self.db, "repair", status="verified", evidence=proof())
        self.assertEqual(records(self.db)["second"]["status"], "implemented")
        self.assertNotIn("verification", records(self.db)["second"])
        update(self.db, "second", status="verified", evidence=proof("second"))
        self.assertNotIn("invalidatedDependencies", records(self.db)["second"])

    def test_concurrent_duplicate_intake_creates_one_event(self):
        file = Path(self.directory.name) / "intake.json"
        file.write_text(json.dumps([request()]))
        command = [sys.executable, str(Path(__file__).with_name("program_backlog.py")),
                   "--db", str(self.path), "intake", str(file)]
        workers = [subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                    text=True) for _ in range(2)]
        results = []
        for worker in workers:
            stdout, stderr = worker.communicate(timeout=10)
            self.assertEqual(worker.returncode, 0, stderr)
            results.append(json.loads(stdout))
        self.assertEqual(sum(len(r["added"]) for r in results), 1)
        self.assertEqual(sum(len(r["retained"]) for r in results), 1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0], 1)

    def test_invalid_evidence_shapes_leave_state_unchanged(self):
        intake(self.db, [request()])
        for evidence in [[], {"units": "wrong"}, {"units": [None]}]:
            with self.subTest(evidence=evidence), self.assertRaises(ValueError):
                update(self.db, "repair", status="verified", evidence=evidence)
        self.assertEqual(records(self.db)["repair"]["status"], "captured")

    def test_restart_preserves_intake_and_audit(self):
        intake(self.db, [request()])
        update(self.db, "repair", status="active", owner="worker", note="investigating")
        self.db.close()
        self.db = connect(self.path)
        self.assertEqual(records(self.db)["repair"]["owner"], "worker")
        self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0], 2)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_duplicate_dump_does_not_reset_active_progress(self):
        intake(self.db, [request()])
        update(self.db, "repair", status="active", owner="worker")
        result = intake(self.db, [request()])
        self.assertEqual(result, {"added": [], "retained": ["repair"]})
        self.assertEqual(records(self.db)["repair"]["status"], "active")
        self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0], 2)

    def test_conflicting_dump_rolls_back_entire_batch(self):
        intake(self.db, [request()])
        altered = dict(request(), acceptance="different scope")
        with self.assertRaisesRegex(ValueError, "conflicting intake"):
            intake(self.db, [request("another"), altered])
        self.assertEqual(list(records(self.db)), ["repair"])
        self.assertEqual(self.db.execute("SELECT count(*) FROM events").fetchone()[0], 1)

    def test_unknown_dependency_and_cycle_do_not_partially_capture(self):
        for items in [[dict(request(), dependencies=["absent"])],
                      [dict(request(), dependencies=["second"]), dict(request("second"), dependencies=["repair"])]]:
            with self.assertRaises(ValueError):
                intake(self.db, items)
            self.assertEqual(records(self.db), {})

    def test_dependencies_require_verification_before_dispatch(self):
        intake(self.db, [request(), dict(request("second"), dependencies=["repair"])])
        with self.assertRaisesRegex(ValueError, "unverified dependencies"):
            update(self.db, "second", status="active", owner="worker")
        update(self.db, "repair", status="verified", evidence=proof())
        update(self.db, "second", status="active", owner="worker")
        self.assertEqual(records(self.db)["second"]["status"], "active")

    def test_active_requires_owner_even_when_owner_is_cleared(self):
        intake(self.db, [request()])
        with self.assertRaisesRegex(ValueError, "owner"):
            update(self.db, "repair", status="active")
        update(self.db, "repair", status="active", owner="worker")
        with self.assertRaisesRegex(ValueError, "owner"):
            update(self.db, "repair", owner="")
        self.assertEqual(records(self.db)["repair"]["owner"], "worker")

    def test_implemented_is_not_verified(self):
        intake(self.db, [request()])
        update(self.db, "repair", status="implemented", link="https://example.test/pr/1")
        self.assertEqual(snapshot(self.db)["counts"]["verified"], 0)
        with self.assertRaisesRegex(ValueError, "evidence board"):
            update(self.db, "repair", status="verified")

    def test_wrong_gate_set_and_stale_or_skipped_proof_rejected(self):
        intake(self.db, [request()])
        bad = proof()
        bad["units"][0]["requiredEvidence"] = ["focused"]
        with self.assertRaisesRegex(ValueError, "requirements"):
            update(self.db, "repair", status="verified", evidence=bad)
        for modification in ["new-head", "skipped", "fail", "pending"]:
            bad = proof()
            if modification == "new-head":
                bad["units"][0]["head"] = "b" * 40
            else:
                bad["units"][0]["evidence"][1]["result"] = modification
            with self.subTest(modification=modification), self.assertRaises(ValueError):
                update(self.db, "repair", status="verified", evidence=bad)
        self.assertEqual(records(self.db)["repair"]["status"], "captured")

    def test_reopen_removes_current_verdict_but_retains_history(self):
        intake(self.db, [request()])
        update(self.db, "repair", status="verified", evidence=proof())
        update(self.db, "repair", status="active", owner="worker", note="new report")
        self.assertNotIn("verification", records(self.db)["repair"])
        events = self.db.execute("SELECT payload FROM events ORDER BY seq").fetchall()
        self.assertIn("verification", json.loads(events[1][0]))

    def test_readonly_snapshot_does_not_write_or_initialize(self):
        intake(self.db, [request()])
        other = connect(self.path, readonly=True)
        try:
            self.assertFalse(snapshot(other)["liveVerificationPerformed"])
            with self.assertRaises(sqlite3.OperationalError):
                update(other, "repair", status="blocked")
        finally:
            other.close()
        missing = self.path.with_name("missing.sqlite")
        with self.assertRaisesRegex(ValueError, "missing"):
            connect(missing, readonly=True)
        self.assertFalse(missing.exists())

    def test_init_never_overwrites_existing_store(self):
        intake(self.db, [request()])
        with self.assertRaisesRegex(ValueError, "exists"):
            connect(self.path, initialize=True)
        self.assertIn("repair", records(self.db))

    def test_cli_import_then_read_survives_separate_processes(self):
        file = Path(self.directory.name) / "intake.json"
        file.write_text(json.dumps([request()]))
        script = Path(__file__).with_name("program_backlog.py")
        for command in [["intake", str(file)], ["snapshot"]]:
            result = subprocess.run([sys.executable, str(script), "--db", str(self.path), *command],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 0, result.stderr)
            payload = json.loads(result.stdout)
        self.assertEqual(payload["counts"]["captured"], 1)

    def test_invalid_new_status_and_shape_rejected(self):
        for item in [dict(request(), status="verified"), dict(request(), priority=True),
                     dict(request(), acceptance=""), dict(request(), requiredEvidence=[]),
                     dict(request(), id="Bad ID")]:
            with self.subTest(item=item), self.assertRaises(ValueError):
                intake(self.db, [item])
        self.assertEqual(records(self.db), {})


if __name__ == "__main__":
    unittest.main()
