#!/usr/bin/env python3
"""Persistent private request intake with transactional history; no external writes."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
from datetime import datetime, timezone

from check_program_state import check_program

STATES = {"captured", "ready", "active", "blocked", "implemented", "verified", "deferred"}
KINDS = {"bug", "feature", "improvement", "idea", "delivery"}
ID = re.compile(r"[a-z][a-z0-9-]{2,79}\Z")
DEFAULT_DB = Path.home() / ".local/share/tuturuuu/orchestration/programs/platform/backlog.sqlite"


def now():
    return datetime.now(timezone.utc).isoformat()


def connect(path: Path, *, initialize=False, readonly=False):
    if initialize:
        if path.exists():
            raise ValueError("store exists; inspect it rather than reinitialize")
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        # Exclusive creation avoids replacing an existing store or following a symlink.
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        os.close(fd)
    if not path.is_file():
        raise ValueError("store missing; run init with an explicit private path")
    mode = "ro" if readonly else "rw"
    db = sqlite3.connect(path.resolve().as_uri() + "?mode=" + mode, uri=True, timeout=10)
    db.row_factory = sqlite3.Row
    if initialize:
        with db:
            db.execute("CREATE TABLE items (id TEXT PRIMARY KEY, payload TEXT NOT NULL)")
            db.execute("CREATE TABLE events (seq INTEGER PRIMARY KEY, item_id TEXT NOT NULL, "
                       "at TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL)")
    return db


def records(db):
    return {row["id"]: json.loads(row["payload"]) for row in db.execute("SELECT * FROM items")}


def validate(item):
    if not isinstance(item, dict) or not isinstance(item.get("id"), str) or not ID.fullmatch(item["id"]):
        raise ValueError("request id must be a stable lowercase slug")
    for key in ["title", "source", "acceptance"]:
        if not isinstance(item.get(key), str) or not item[key].strip():
            raise ValueError(f"request {item['id']} needs {key}")
    if item.get("kind") not in KINDS or item.get("status", "captured") not in STATES:
        raise ValueError("unknown request kind or status")
    if type(item.get("priority", 2)) is not int or not 0 <= item.get("priority", 2) <= 3:
        raise ValueError("priority must be 0 (urgent) through 3 (later)")
    for key in ["dependencies", "requiredEvidence"]:
        values = item.get(key, [])
        if (not isinstance(values, list) or any(not isinstance(v, str) or not v.strip() for v in values)
                or len(values) != len(set(values))):
            raise ValueError(f"{key} must contain unique strings")
    if not item.get("requiredEvidence"):
        raise ValueError("requiredEvidence cannot be empty")


def validate_dependencies(items):
    visiting, visited = set(), set()
    def visit(key):
        if key in visiting:
            raise ValueError("dependency cycle")
        if key in visited:
            return
        visiting.add(key)
        for dependency in items[key].get("dependencies", []):
            if dependency not in items:
                raise ValueError(f"unknown dependency {dependency}")
            visit(dependency)
        visiting.remove(key)
        visited.add(key)
    for key in items:
        visit(key)


def event(db, item, action):
    payload = json.dumps(item, sort_keys=True, ensure_ascii=False)
    db.execute("INSERT INTO events(item_id,at,action,payload) VALUES(?,?,?,?)",
               (item["id"], now(), action, payload))
    db.execute("INSERT INTO items VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
               (item["id"], payload))


def intake(db, incoming):
    if not isinstance(incoming, list) or not incoming:
        raise ValueError("intake must be a nonempty JSON list")
    # One writer transaction: duplicate imports never reset progressed status.
    with db:
        db.execute("BEGIN IMMEDIATE")
        existing = records(db)
        proposed = dict(existing)
        added, retained = [], []
        for item in incoming:
            validate(item)
            key = item["id"]
            if key in proposed:
                original = proposed[key]
                fields = ["title", "source", "acceptance", "kind", "dependencies", "requiredEvidence"]
                if any(original.get(f, []) != item.get(f, []) for f in fields):
                    raise ValueError(f"conflicting intake {key}; update intentionally, never overwrite")
                retained.append(key)
                continue
            if item.get("status", "captured") != "captured":
                raise ValueError("new intake starts captured; progress requires an audited update")
            current = dict(item, status="captured", owner="", links=[], note="")
            proposed[key] = current
            added.append(key)
        validate_dependencies(proposed)
        for key in added:
            event(db, proposed[key], "capture")
    return {"added": added, "retained": retained}


def update(db, key, *, status=None, owner=None, note=None, link=None, evidence=None):
    with db:
        db.execute("BEGIN IMMEDIATE")
        items = records(db)
        if key not in items:
            raise ValueError("unknown request id")
        item = dict(items[key])
        if status is not None:
            if status not in STATES:
                raise ValueError("unknown status")
            if status in {"ready", "active", "verified"}:
                pending = [d for d in item.get("dependencies", []) if items[d]["status"] != "verified"]
                if pending:
                    raise ValueError(f"unverified dependencies: {pending}")
            if status == "active" and not (owner or item["owner"]).strip():
                raise ValueError("active request needs an owner")
            if status == "verified":
                if evidence is None:
                    raise ValueError("verified requires a current-head evidence board")
                if not isinstance(evidence, dict) or not isinstance(evidence.get("units"), list):
                    raise ValueError("evidence must be a program board")
                matches = [u for u in evidence["units"] if isinstance(u, dict) and u.get("id") == key]
                if len(matches) != 1 or set(matches[0].get("requiredEvidence", [])) != set(item["requiredEvidence"]):
                    raise ValueError("evidence requirements must match this request")
                proof = {"version": evidence.get("version"), "units": matches}
                if not check_program(proof)["recordedEvidenceComplete"]:
                    raise ValueError("current-head evidence is incomplete")
                item["verification"] = proof
            elif item.get("status") == "verified":
                # Reopening invalidates completion without deleting the historical receipt.
                item.pop("verification", None)
            item["status"] = status
        if owner is not None:
            item["owner"] = owner
        if note is not None:
            item["note"] = note
        if link is not None and link not in item["links"]:
            item["links"] = [*item["links"], link]
        if item["status"] == "active" and not item["owner"].strip():
            raise ValueError("active request needs an owner")
        event(db, item, "update")
    return item


def snapshot(db):
    items = sorted(records(db).values(), key=lambda x: (x.get("priority", 2), x["id"]))
    counts = {state: sum(i["status"] == state for i in items) for state in sorted(STATES)}
    return {"counts": counts, "items": items, "liveVerificationPerformed": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("init")
    capture = sub.add_parser("intake")
    capture.add_argument("file", type=Path)
    sub.add_parser("snapshot")
    history = sub.add_parser("history")
    history.add_argument("id")
    change = sub.add_parser("update")
    change.add_argument("id")
    change.add_argument("--status", choices=sorted(STATES))
    change.add_argument("--owner")
    change.add_argument("--note")
    change.add_argument("--link")
    change.add_argument("--evidence", type=Path)
    args = parser.parse_args()
    try:
        with connect(args.db, initialize=args.command == "init",
                     readonly=args.command in {"snapshot", "history"}) as db:
            if args.command == "init":
                result = {"initialized": True, "path": str(args.db)}
            elif args.command == "intake":
                result = intake(db, json.loads(args.file.read_text()))
            elif args.command == "snapshot":
                result = snapshot(db)
            elif args.command == "history":
                result = [dict(row) for row in db.execute("SELECT * FROM events WHERE item_id=? ORDER BY seq", (args.id,))]
            else:
                evidence = json.loads(args.evidence.read_text()) if args.evidence else None
                result = update(db, args.id, status=args.status, owner=args.owner,
                                note=args.note, link=args.link, evidence=evidence)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (OSError, ValueError, TypeError, sqlite3.Error) as error:
        print(f"backlog error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
