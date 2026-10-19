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


def experiment_board():
    """Offline contrast: a compiler-only ledger falsely used for production readiness."""
    state = board()
    controls = {key: "1" * 64 for key in
                ["input", "context", "constraints", "model", "executor", "improver",
                 "judge", "webAccess"]}
    experiment = {
        "id": "offline-production-receipt-v1", "unit": "repair", "head": HEAD,
        "task": "report-production-readiness", "controls": controls,
        "variants": {"baseline": "2" * 64, "candidate": "3" * 64},
        "cases": [{"id": "compiler-is-not-runtime", "kind": "runtime", "input": "4" * 64}],
        "budget": {"limit": 2, "used": 2}, "decision": "adopt",
        "comparison": {"summary": "Candidate reports absent runtime evidence.",
                       "receipt": "synthetic/paired-reports"},
        "lesson": {"scope": "production readiness ledgers",
                   "text": "Require runtime evidence before reporting production readiness."},
        "regression": {"head": HEAD, "content": "3" * 64, "controls": controls,
                       "result": "pass", "receipt": "synthetic/regression"},
        "observations": [],
    }
    for variant in ["baseline", "candidate"]:
        probe = board()
        unit = probe["units"][0]
        unit["requiredEvidence"] = ["focused"] if variant == "baseline" else ["focused", "runtime"]
        unit["evidence"] = unit["evidence"][:1]
        report = check_program(probe)
        # Evaluate actual ledger behavior against the declared missing-runtime case.
        correct = not report["recordedEvidenceComplete"] and "runtime" in report["units"][0]["missing"]
        experiment["observations"].append({
            "variant": variant, "case": "compiler-is-not-runtime", "head": HEAD,
            "task": experiment["task"], "controls": copy.deepcopy(controls),
            "content": experiment["variants"][variant], "input": "4" * 64,
            "kind": "runtime", "outcome": "pass" if correct else "fail",
            "receipt": "synthetic/" + variant + "/checker-report",
        })
    state["experiments"] = [experiment]
    return state


class ExperimentTests(unittest.TestCase):
    def test_offline_paired_checker_behavior_and_backwards_compatibility(self):
        self.assertNotIn("experiments", check_program(board()))
        result = check_program(experiment_board())
        self.assertFalse(result["liveVerificationPerformed"])
        experiment = result["experiments"][0]
        self.assertEqual(experiment["improved"], ["compiler-is-not-runtime"])
        self.assertEqual(experiment["outcomes"]["baseline"]["fail"], 1)
        self.assertEqual(experiment["outcomes"]["candidate"]["pass"], 1)

    def test_self_reported_better_without_paired_proof_is_rejected(self):
        state = experiment_board()
        experiment = state["experiments"][0]
        experiment["comparison"]["summary"] = "better"
        experiment["observations"] = []
        with self.assertRaisesRegex(ValueError, "census"):
            check_program(state)

    def test_old_sha_compiler_receipt_and_changed_controls_are_incomparable(self):
        for field, value in [("head", OLD), ("task", "other-task"),
                             ("input", "5" * 64), ("kind", "focused"),
                             ("content", "2" * 64)]:
            with self.subTest(field=field):
                state = experiment_board()
                state["experiments"][0]["observations"][1][field] = value
                with self.assertRaisesRegex(ValueError, "incomparable"):
                    check_program(state)
        for control in ["constraints", "model", "executor", "improver", "judge", "webAccess", "context"]:
            with self.subTest(control=control):
                state = experiment_board()
                state["experiments"][0]["observations"][1]["controls"][control] = "5" * 64
                with self.assertRaisesRegex(ValueError, "incomparable"):
                    check_program(state)

    def test_overbudget_and_incomplete_case_census_are_rejected(self):
        state = experiment_board()
        state["experiments"][0]["budget"]["limit"] = 1
        with self.assertRaisesRegex(ValueError, "bounded probe budget"):
            check_program(state)
        state = experiment_board()
        state["experiments"][0]["observations"].pop()
        state["experiments"][0]["budget"]["used"] = 1
        with self.assertRaisesRegex(ValueError, "both variant outcomes"):
            check_program(state)

    def test_worsening_ties_failure_and_unknowns_cannot_be_adopted(self):
        for baseline, candidate in [("pass", "fail"), ("pass", "pass"),
                                    ("fail", "fail"), ("unknown", "pass"),
                                    ("error", "pass"), ("fail", "unknown")]:
            with self.subTest(baseline=baseline, candidate=candidate):
                state = experiment_board()
                experiment = state["experiments"][0]
                for observation, outcome in zip(experiment["observations"], [baseline, candidate]):
                    observation["outcome"] = outcome
                with self.assertRaisesRegex(ValueError, "adoption requires improvement"):
                    check_program(state)
                experiment["decision"] = "reject"
                report = check_program(state)["experiments"][0]
                self.assertEqual(report["outcomes"]["baseline"][baseline], 1)
                self.assertEqual(report["outcomes"]["candidate"][candidate], 1)

    def test_one_improvement_cannot_hide_a_regression_in_another_case(self):
        state = experiment_board()
        experiment = state["experiments"][0]
        case = copy.deepcopy(experiment["cases"][0])
        case["id"] = "existing-success"
        experiment["cases"].append(case)
        for observation, outcome in zip(copy.deepcopy(experiment["observations"]), ["pass", "fail"]):
            observation.update(case="existing-success", outcome=outcome)
            experiment["observations"].append(observation)
        experiment["budget"] = {"limit": 4, "used": 4}
        with self.assertRaisesRegex(ValueError, "without worsening"):
            check_program(state)
        experiment["decision"] = "reject"
        report = check_program(state)["experiments"][0]
        self.assertEqual(report["improved"], ["compiler-is-not-runtime"])
        self.assertEqual(report["worsened"], ["existing-success"])

    def test_adoption_requires_comparison_scoped_lesson_and_regression(self):
        for field in ["comparison", "lesson", "regression"]:
            state = experiment_board()
            del state["experiments"][0][field]
            with self.assertRaises(ValueError):
                check_program(state)
        for field, value in [("head", OLD), ("content", "2" * 64),
                             ("result", "skipped"), ("receipt", "")]:
            state = experiment_board()
            state["experiments"][0]["regression"][field] = value
            with self.assertRaisesRegex(ValueError, "regression PASS"):
                check_program(state)

    def test_experiment_does_not_supply_delivery_proof(self):
        state = experiment_board()
        state["units"][0]["evidence"].pop()
        self.assertFalse(check_program(state)["recordedEvidenceComplete"])
        state["units"][0]["state"] = "delivered"
        with self.assertRaisesRegex(ValueError, "delivered claim lacks"):
            check_program(state)

    def test_malformed_and_duplicate_experiments_are_rejected(self):
        for field, value in [("controls", {}), ("variants", {}), ("cases", []),
                             ("budget", {"limit": True, "used": 2}),
                             ("observations", {}), ("unit", []), ("head", OLD)]:
            state = experiment_board()
            state["experiments"][0][field] = value
            with self.assertRaises(ValueError):
                check_program(state)
        state = experiment_board()
        state["experiments"].append(copy.deepcopy(state["experiments"][0]))
        with self.assertRaisesRegex(ValueError, "unique namespace"):
            check_program(state)


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
