"""Regression tests for stale proof, overlapping ownership and false delivery."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from check_program_state import check_program

HEAD = "a" * 40
OLD = "b" * 40


def board():
    return {"version": 1, "units": [{
        "id": "repair", "owner": "worker", "worktree": ".worktrees/repair",
        "head": HEAD, "state": "merged",
        "requiredEvidence": ["focused", "exact-ci", "deployment", "store", "runtime"],
        "evidence": [{"kind": kind, "head": HEAD, "result": "pass",
                      "receipt": "receipt/" + kind}
                     for kind in ["focused", "exact-ci", "deployment", "store", "runtime"]],
    }]}


class ProgramStateTests(unittest.TestCase):
    def test_cli_exit_codes_and_machine_readable_status(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "state.json"
            state = board()
            script = Path(__file__).with_name("check_program_state.py")
            for expected in [0, 1, 2]:
                with self.subTest(exit=expected):
                    if expected == 1:
                        state["units"][0]["head"] = OLD
                    elif expected == 2:
                        state["units"][0]["state"] = "delivered"
                    path.write_text(json.dumps(state))
                    result = subprocess.run([sys.executable, str(script), str(path)],
                                            capture_output=True, text=True, check=False)
                    self.assertEqual(result.returncode, expected)
                    if expected != 2:
                        self.assertFalse(json.loads(result.stdout)["liveVerificationPerformed"])
                    else:
                        self.assertIn("delivered claim lacks", result.stderr)
            path.write_text("{broken")
            result = subprocess.run([sys.executable, str(script), str(path)],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 2)

    def test_complete_receipts_do_not_claim_live_verification(self):
        result = check_program(board())
        self.assertTrue(result["recordedEvidenceComplete"])
        self.assertFalse(result["liveVerificationPerformed"])

    def test_new_head_invalidates_every_old_receipt(self):
        state = board()
        state["units"][0]["head"] = OLD
        result = check_program(state)
        self.assertFalse(result["recordedEvidenceComplete"])
        self.assertEqual(result["units"][0]["staleReceipts"], 5)
        self.assertEqual(len(result["units"][0]["missing"]), 5)

    def test_skipped_queued_failed_or_absent_publication_is_not_delivery(self):
        for outcome in ["pending", "skipped", "fail", None]:
            with self.subTest(outcome=outcome):
                state = board()
                if outcome is None:
                    state["units"][0]["evidence"].pop(3)
                else:
                    state["units"][0]["evidence"][3]["result"] = outcome
                self.assertFalse(check_program(state)["recordedEvidenceComplete"])
                state["units"][0]["state"] = "delivered"
                with self.assertRaisesRegex(ValueError, "delivered claim lacks"):
                    check_program(state)

    def test_active_and_blocked_units_are_not_complete(self):
        for status in ["active", "blocked", "handoff"]:
            state = board()
            state["units"][0]["state"] = status
            self.assertFalse(check_program(state)["recordedEvidenceComplete"])

    def test_duplicate_gate_does_not_hide_a_pending_run(self):
        state = board()
        receipt = copy.deepcopy(state["units"][0]["evidence"][0])
        receipt["result"] = "pending"
        state["units"][0]["evidence"].append(receipt)
        with self.assertRaisesRegex(ValueError, "duplicate current-head gate"):
            check_program(state)

    def test_missing_receipt_locator_is_invalid(self):
        state = board()
        state["units"][0]["evidence"][0]["receipt"] = ""
        with self.assertRaisesRegex(ValueError, "locator"):
            check_program(state)

    def test_one_active_writer_per_worktree(self):
        state = board()
        state["units"][0]["state"] = "active"
        other = copy.deepcopy(state["units"][0])
        other.update(id="second", owner="another")
        state["units"].append(other)
        with self.assertRaisesRegex(ValueError, "multiple active writers"):
            check_program(state)
        other["worktree"] = ".worktrees/second"
        self.assertEqual(len(check_program(state)["units"]), 2)

    def test_bad_shapes_are_rejected(self):
        for field, value in [("head", "abc123"), ("requiredEvidence", []),
                             ("requiredEvidence", ["focused", "focused"]),
                             ("evidence", {}), ("owner", ""), ("state", "done")]:
            with self.subTest(field=field, value=value):
                state = board()
                state["units"][0][field] = value
                with self.assertRaises(ValueError):
                    check_program(state)

    def test_duplicate_units_are_rejected(self):
        state = board()
        state["units"].append(copy.deepcopy(state["units"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate unit"):
            check_program(state)

    def test_old_failure_cannot_override_current_pass(self):
        state = board()
        receipt = copy.deepcopy(state["units"][0]["evidence"][0])
        receipt.update(head=OLD, result="fail")
        state["units"][0]["evidence"].append(receipt)
        self.assertTrue(check_program(state)["recordedEvidenceComplete"])


if __name__ == "__main__":
    unittest.main()
