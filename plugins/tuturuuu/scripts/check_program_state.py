#!/usr/bin/env python3
"""Check recorded orchestration evidence; never query or mutate external systems."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SHA = re.compile(r"[0-9a-f]{40}\Z")
STATES = {"active", "blocked", "handoff", "merged", "delivered"}
RESULTS = {"pending", "pass", "fail", "skipped"}
PIN = re.compile(r"[0-9a-f]{64}\Z")
CONTROLS = {"input", "context", "constraints", "model", "executor", "improver",
            "judge", "webAccess"}
OUTCOMES = ("pass", "fail", "unknown", "error")


def nonempty(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def check_experiments(experiments, units: dict) -> list:
    """Check recorded paired observations, not their truth or execution safety."""
    if not isinstance(experiments, list):
        raise ValueError("experiments must be a list")
    summaries = []
    ids = set()
    for experiment in experiments:
        if not isinstance(experiment, dict):
            raise ValueError("experiment must be an object")
        eid = experiment.get("id")
        if not nonempty(eid) or eid in ids:
            raise ValueError("experiment requires a unique namespace id")
        ids.add(eid)
        uid = experiment.get("unit")
        unit = units.get(uid) if isinstance(uid, str) else None
        if unit is None or experiment.get("head") != unit["head"]:
            raise ValueError("experiment requires a known unit and current head")
        if not nonempty(experiment.get("task")):
            raise ValueError("experiment requires a task identity")
        decision = experiment.get("decision")
        if not isinstance(decision, str) or decision not in {"probe", "reject", "adopt"}:
            raise ValueError("experiment requires probe, reject or adopt decision")
        controls = experiment.get("controls")
        if (not isinstance(controls, dict) or controls.keys() != CONTROLS
                or any(not isinstance(v, str) or not PIN.fullmatch(v)
                       for v in controls.values())):
            raise ValueError("experiment requires all fixed control SHA256 pins")
        variants = experiment.get("variants")
        if (not isinstance(variants, dict) or variants.keys() != {"baseline", "candidate"}
                or any(not isinstance(v, str) or not PIN.fullmatch(v)
                       for v in variants.values()) or len(set(variants.values())) != 2):
            raise ValueError("experiment requires distinct baseline/candidate content pins")
        cases = experiment.get("cases")
        if not isinstance(cases, list) or not cases:
            raise ValueError("experiment requires a closed nonempty case manifest")
        manifest = {}
        for case in cases:
            if (not isinstance(case, dict) or not nonempty(case.get("id"))
                    or case["id"] in manifest
                    or case.get("kind") not in unit["requiredEvidence"]
                    or not isinstance(case.get("input"), str)
                    or not PIN.fullmatch(case["input"])):
                raise ValueError("case requires unique id, required evidence kind and input pin")
            manifest[case["id"]] = case
        budget = experiment.get("budget")
        if (not isinstance(budget, dict) or budget.keys() != {"limit", "used"}
                or any(type(v) is not int or v < 1 for v in budget.values())
                or budget["used"] > budget["limit"]):
            raise ValueError("experiment requires a positive bounded probe budget")
        observations = experiment.get("observations")
        if not isinstance(observations, list) or len(observations) != budget["used"]:
            raise ValueError("probe usage must match the full observation census")
        paired = {}
        census = {variant: dict.fromkeys(OUTCOMES, 0) for variant in variants}
        for observation in observations:
            if not isinstance(observation, dict):
                raise ValueError("observation must be an object")
            variant, cid = observation.get("variant"), observation.get("case")
            if (not isinstance(variant, str) or variant not in variants
                    or not isinstance(cid, str) or cid not in manifest):
                raise ValueError("observation requires known variant and case")
            key = (variant, cid)
            if key in paired:
                raise ValueError("duplicate paired observation")
            case = manifest[cid]
            if (observation.get("head") != unit["head"]
                    or observation.get("task") != experiment["task"]
                    or observation.get("controls") != controls
                    or observation.get("content") != variants[variant]
                    or observation.get("input") != case["input"]
                    or observation.get("kind") != case["kind"]):
                raise ValueError("stale or incomparable paired observation")
            outcome = observation.get("outcome")
            if (not isinstance(outcome, str) or outcome not in OUTCOMES
                    or not nonempty(observation.get("receipt"))):
                raise ValueError("observation requires outcome and behavior receipt")
            paired[key] = outcome
            census[variant][outcome] += 1
        if len(paired) != 2 * len(manifest):
            raise ValueError("every declared case requires both variant outcomes")
        improved = [cid for cid in manifest
                    if paired["baseline", cid] == "fail" and paired["candidate", cid] == "pass"]
        worsened = [cid for cid in manifest
                    if paired["baseline", cid] == "pass" and paired["candidate", cid] == "fail"]
        unresolved = any(counts["unknown"] or counts["error"] for counts in census.values())
        if decision == "adopt":
            if not improved or worsened or unresolved or census["candidate"]["fail"]:
                raise ValueError("adoption requires improvement without worsening or unresolved outcomes")
            comparison, lesson = experiment.get("comparison"), experiment.get("lesson")
            if (not isinstance(comparison, dict)
                    or not all(nonempty(comparison.get(k)) for k in ("summary", "receipt"))
                    or not isinstance(lesson, dict)
                    or not all(nonempty(lesson.get(k)) for k in ("scope", "text"))):
                raise ValueError("adoption requires a recorded comparison and scoped lesson")
            regression = experiment.get("regression")
            if (not isinstance(regression, dict) or regression.get("head") != unit["head"]
                    or regression.get("content") != variants["candidate"]
                    or regression.get("controls") != controls
                    or regression.get("result") != "pass"
                    or not nonempty(regression.get("receipt"))):
                raise ValueError("adoption requires current candidate regression PASS receipt")
        summaries.append({"id": eid, "decision": decision, "outcomes": census,
                          "improved": improved, "worsened": worsened,
                          "unresolved": unresolved})
    return summaries


def check_program(board: dict) -> dict:
    """Reject inconsistent completion claims and report missing current-head proof."""
    if not isinstance(board, dict) or board.get("version") != 1:
        raise ValueError("program state must have version 1")
    units = board.get("units")
    if not isinstance(units, list) or not units:
        raise ValueError("units must be a nonempty list")
    ids = set()
    writers = set()
    summaries = []
    for unit in units:
        if not isinstance(unit, dict):
            raise ValueError("each unit must be an object")
        for field in ("id", "owner", "worktree", "head"):
            if not isinstance(unit.get(field), str) or not unit[field].strip():
                raise ValueError(f"unit requires {field}")
        if unit["id"] in ids:
            raise ValueError("duplicate unit id")
        ids.add(unit["id"])
        if not SHA.fullmatch(unit["head"]):
            raise ValueError("head must be a full lowercase SHA")
        state = unit.get("state")
        if state not in STATES:
            raise ValueError("unknown unit state")
        if state == "active":
            if unit["worktree"] in writers:
                raise ValueError("multiple active writers in one worktree")
            writers.add(unit["worktree"])
        required = unit.get("requiredEvidence")
        if (not isinstance(required, list) or not required
                or any(not isinstance(k, str) or not k.strip() for k in required)
                or len(set(required)) != len(required)):
            raise ValueError("requiredEvidence must contain unique named gates")
        evidence = unit.get("evidence", [])
        if not isinstance(evidence, list):
            raise ValueError("evidence must be a list")
        current = {}
        stale = 0
        for receipt in evidence:
            if not isinstance(receipt, dict):
                raise ValueError("each receipt must be an object")
            if (receipt.get("kind") not in required
                    or not isinstance(receipt.get("head"), str)
                    or not SHA.fullmatch(receipt["head"])
                    or receipt.get("result") not in RESULTS
                    or not isinstance(receipt.get("receipt"), str)
                    or not receipt["receipt"].strip()):
                raise ValueError("receipt requires known kind, full SHA, result and locator")
            if receipt["head"] != unit["head"]:
                stale += 1
                continue
            if receipt["kind"] in current:
                raise ValueError("duplicate current-head gate; replace its observation")
            current[receipt["kind"]] = receipt["result"]
        missing = [kind for kind in required if current.get(kind) != "pass"]
        if state == "delivered" and missing:
            raise ValueError(f"{unit['id']}: delivered claim lacks current-head PASS: {missing}")
        summaries.append({"id": unit["id"], "state": state, "missing": missing,
                          "staleReceipts": stale})
    ready = all(not item["missing"] and item["state"] in {"merged", "delivered"}
                for item in summaries)
    result = {"recordedEvidenceComplete": ready, "units": summaries,
              "liveVerificationPerformed": False}
    if "experiments" in board:
        result["experiments"] = check_experiments(
            board["experiments"], {unit["id"]: unit for unit in units})
    return result


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: check_program_state.py <ignored-program-state.json>", file=sys.stderr)
        return 2
    try:
        result = check_program(json.loads(Path(sys.argv[1]).read_text()))
    except (OSError, ValueError, TypeError) as error:
        print(f"invalid program state: {error}", file=sys.stderr)
        return 2
    print(json.dumps(result))
    return 0 if result["recordedEvidenceComplete"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
