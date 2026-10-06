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
    return {"recordedEvidenceComplete": ready, "units": summaries,
            "liveVerificationPerformed": False}


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
