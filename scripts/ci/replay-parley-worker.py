#!/usr/bin/env python3
"""Replay one retained Parley artifact; never rebuild or contact production."""

import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import platform
import re
import resource
import selectors
import signal
import socket
import stat
import subprocess
import threading
import time
import zipfile

SOURCE = "387caf4872a59cc4944b16324a2554062393d7d1"
RUN = 37853687763
ARTIFACT = 11583133658
DIGEST = "bae22250ae12ee484138c9b1fd3f0e7409f7af1c5f645f1df11fff33661fb23b"
LOG_LIMIT = 1024 * 1024
STATE_LIMIT = 256 * 1024 * 1024
PORT = 49187


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def read_json(path):
    return json.loads(Path(path).read_bytes())


def identity(path):
    path = Path(path).resolve(strict=True)
    require(path.is_file(), "Expected regular file")
    return {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def save(path, value):
    with open(path, "x", encoding="utf-8") as file:
        os.chmod(path, 0o600)
        json.dump(value, file, indent=2)
        file.write("\n")
        file.flush()
        os.fsync(file.fileno())


def validate_metadata(data):
    run = data.get("workflow_run") or {}
    require(data.get("id") == ARTIFACT and data.get("name") == f"parley-worker-{SOURCE}", "Artifact identity mismatch")
    require(data.get("expired") is False and data.get("digest") == f"sha256:{DIGEST}", "Artifact expired or digest mismatch")
    require(run.get("id") == RUN and run.get("head_sha") == SOURCE and run.get("head_branch") == "production", "Producer run mismatch")


def extract(archive, destination):
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        require(len(entries) <= 20000 and sum(i.file_size for i in entries) <= 512 * 1024 * 1024, "Archive expansion limit")
        names = set()
        for item in entries:
            name = item.filename
            mode = item.external_attr >> 16
            require(name and not name.startswith("/") and ".." not in name.split("/") and "\\" not in name and "\x00" not in name, "Unsafe archive path")
            require(name not in names and not stat.S_ISLNK(mode), "Duplicate path or symlink")
            require(not mode or stat.S_ISREG(mode) or stat.S_ISDIR(mode), "Unsupported archive file type")
            names.add(name)
        destination.mkdir(mode=0o700)
        for item in entries:
            target = destination / item.filename
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True, mode=0o700)
            else:
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                with os.fdopen(fd, "wb") as file:
                    file.write(bundle.read(item))


def resolve_tools(source, node):
    source = source.resolve(strict=True)
    manifest = source / "apps/parley/package.json"
    script = """
const {createRequire} = require("node:module");
const {dirname, join} = require("node:path");
const app = process.argv[1];
const wrangler = createRequire(app).resolve("wrangler/package.json");
const fromWrangler = createRequire(wrangler);
const workerd = fromWrangler.resolve("workerd/package.json");
const esbuild = fromWrangler.resolve("esbuild/package.json");
console.log(JSON.stringify({parleyManifest: app, wranglerManifest: wrangler,
  workerdManifest: workerd, esbuildManifest: esbuild,
  wrangler: join(dirname(wrangler), "bin/wrangler.js"),
  workerd: createRequire(workerd).resolve("@cloudflare/workerd-linux-64/bin/workerd"),
  esbuild: createRequire(esbuild).resolve("@esbuild/linux-x64/bin/esbuild")}));
"""
    paths = json.loads(subprocess.check_output([node, "--input-type=commonjs", "--eval", script, str(manifest)], text=True))
    require(set(paths) == {"parleyManifest", "wranglerManifest", "workerdManifest", "esbuildManifest",
                           "wrangler", "workerd", "esbuild"}, "Unexpected tool resolution")
    require(all(Path(path).resolve(strict=True).is_relative_to(source) for path in paths.values()), "Tool resolved outside immutable checkout")
    return {"node": identity(node), **{name: identity(path) for name, path in paths.items()}}


def prepare(root, source, node):
    require(root.is_dir() and not root.is_symlink() and stat.S_IMODE(root.stat().st_mode) == 0o700, "Private root required")
    require(platform.system() == "Linux" and platform.machine() == "x86_64", "Linux x64 required")
    require(subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=source, text=True).strip() == SOURCE, "Tool checkout mismatch")
    validate_metadata(read_json(root / "metadata.json"))
    archive = identity(root / "worker.zip")
    require(archive["sha256"] == DIGEST, "Downloaded archive digest mismatch")
    tools = resolve_tools(source, node)
    require(all(os.access(tools[name]["path"], os.X_OK) for name in ("node", "workerd", "esbuild")), "Native tool is not executable")
    require(subprocess.check_output([node, "--version"], text=True).startswith("v24."), "Node 24 required")
    require(read_json(tools["wranglerManifest"]["path"])["version"] == "4.131.1", "Wrangler mismatch")
    require(read_json(tools["workerdManifest"]["path"])["version"] == "1.20260911.1", "workerd mismatch")
    extract(root / "worker.zip", root / "artifact")
    (root / "state").mkdir(mode=0o700)
    config = {
        "name": "parley-offline-diagnostic", "main": str(root / "artifact/worker.js"),
        "compatibility_date": "2026-09-06", "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
        "assets": {"directory": str(root / "artifact/assets"), "binding": "ASSETS"},
        "r2_buckets": [{"binding": "NEXT_INC_CACHE_R2_BUCKET", "bucket_name": "offline-cache"}],
        "services": [{"binding": "WORKER_SELF_REFERENCE", "service": "parley-offline-diagnostic"}],
        "images": {"binding": "IMAGES"},
        "vars": {"NEXT_PUBLIC_MEETING_APP": "parley", "NEXT_PUBLIC_APP_URL": "https://parley.tuturuuu.com",
                 "NEXT_PUBLIC_WEB_APP_URL": "https://tuturuuu.com", "MEET_REALTIME_URL": "wss://meet-realtime.tuturuuu.com/realtime",
                 "NEXT_PUBLIC_SUPABASE_URL": "https://offline.invalid", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "offline-publishable",
                 "SUPABASE_SECRET_KEY": "offline-secret", "MEET_REALTIME_TOKEN_SECRET": "offline-realtime-token"},
    }
    save(root / "wrangler.json", config)
    save(root / "plan.json", {"tools": tools, "archive": archive, "worker": identity(root / "artifact/worker.js"),
                              "config": identity(root / "wrangler.json"), "outerNet": os.readlink("/proc/self/ns/net"),
                              "outerMount": os.readlink("/proc/self/ns/mnt")})


def isolation(plan):
    require(os.geteuid() == 0, "Ephemeral CI namespace root required")
    require(os.readlink("/proc/self/ns/net") != plan["outerNet"], "Network namespace missing")
    require(os.readlink("/proc/self/ns/mnt") != plan["outerMount"], "Mount namespace missing")
    links = json.loads(subprocess.check_output(["/usr/sbin/ip", "-j", "link"], text=True))
    require([row["ifname"] for row in links] == ["lo"], "Unexpected network interface")
    subprocess.run(["/usr/sbin/ip", "link", "set", "lo", "up"], check=True)
    routes = json.loads(subprocess.check_output(["/usr/sbin/ip", "-j", "route", "list", "table", "all"], text=True))
    require(all(row.get("dev") == "lo" for row in routes), "External network route")
    group = Path("/sys/fs/cgroup") / Path(Path("/proc/self/cgroup").read_text().strip().split("::", 1)[1]).relative_to("/")
    memory = (group / "memory.max").read_text().strip()
    cpu = (group / "cpu.max").read_text().split()
    pids = (group / "pids.max").read_text().strip()
    require(memory != "max" and 0 < int(memory) <= 17179869184, "Memory cgroup missing")
    require(cpu[0] != "max" and 0 < int(cpu[0]) <= 10 * int(cpu[1]), "CPU cgroup missing")
    require(pids != "max" and 0 < int(pids) <= 256, "PID cgroup missing")
    affinity = os.sched_getaffinity(0) & set(range(10))
    require(bool(affinity), "No permitted CPU")
    os.sched_setaffinity(0, affinity)
    return {"memoryMax": int(memory), "cpuMax": cpu, "pidsMax": int(pids), "cpus": sorted(affinity)}


def clean_environment(root, node):
    return {"PATH": f"{Path(node).parent}:/usr/bin:/bin", "HOME": str(root / "state/home"),
            "TMPDIR": str(root / "state/tmp"), "XDG_CONFIG_HOME": str(root / "state/home"),
            "CI": "true", "WRANGLER_SEND_METRICS": "false"}


def child_limits(uid, gid):
    resource.setrlimit(resource.RLIMIT_CPU, (45, 45))
    resource.setrlimit(resource.RLIMIT_FSIZE, (LOG_LIMIT, LOG_LIMIT))
    os.setgroups([])
    os.setgid(gid)
    os.setuid(uid)


def group_absent(pid):
    try:
        os.killpg(pid, 0)
        return False
    except ProcessLookupError:
        return True


def close_group(process, drain, overall_deadline):
    for sig in (signal.SIGTERM, signal.SIGKILL):
        if group_absent(process.pid):
            break
        os.killpg(process.pid, sig)
        deadline = min(time.monotonic() + 5, overall_deadline)
        while time.monotonic() < deadline:
            drain()
            process.poll()
            if group_absent(process.pid):
                break
            time.sleep(min(0.02, max(0, deadline - time.monotonic())))
    remaining = overall_deadline - time.monotonic()
    require(remaining > 0, "Cleanup deadline exhausted")
    process.wait(timeout=remaining)
    drain()
    require(group_absent(process.pid), "Worker process group remains")


def request_once(result):
    connection = http.client.HTTPConnection("127.0.0.1", PORT, timeout=15)
    try:
        connection.request("GET", "/access-denied", headers={"Host": "parley.tuturuuu.com", "User-Agent": "curl/offline-diagnostic"})
        response = connection.getresponse()
        body = response.read(LOG_LIMIT + 1)
        require(len(body) <= LOG_LIMIT, "Response overflow")
        result.update({"httpStatus": response.status, "responseBytes": len(body), "responseSHA256": hashlib.sha256(body).hexdigest()})
    except Exception as error:
        result["requestError"] = type(error).__name__
    finally:
        connection.close()
        result["done"] = True


def diagnostic_lines(log):
    lines = []
    for line in log.decode("utf-8", errors="replace").splitlines():
        if re.search(r"error|exception|^\s+at ", line, re.I):
            line = re.sub(r"https?://[^\s]+", "[URL]", line)
            line = re.sub(r"(?:sb_(?:secret|publishable)_[\w.-]+|eyJ[\w.-]+|offline-(?:secret|publishable|realtime-token))", "[REDACTED]", line)
            if re.search(r"authorization|cookie|token\s*[:=]|password|api.?key", line, re.I):
                line = "[sensitive diagnostic line omitted]"
            lines.append(line[:500])
    return lines[:60]


def run(root):
    started = time.monotonic()
    work_deadline, overall_deadline = started + 50, started + 60
    plan = read_json(root / "plan.json")
    for record in [*plan["tools"].values(), plan["archive"], plan["worker"], plan["config"]]:
        require(identity(record["path"]) == record, "Prepared input changed")
    caps = isolation(plan)
    subprocess.run(["/usr/bin/mount", "-t", "tmpfs", "-o", f"size={STATE_LIMIT},nodev,nosuid", "tmpfs", str(root / "state")], check=True)
    uid, gid = root.stat().st_uid, root.stat().st_gid
    for name in ("state", "state/home", "state/tmp"):
        directory = root / name
        directory.mkdir(mode=0o700, exist_ok=True)
        os.chown(directory, uid, gid)
        os.chmod(directory, 0o700)
    save(root / "state/wrangler.json", read_json(root / "wrangler.json"))
    os.chown(root / "state/wrangler.json", uid, gid)
    result = {"state": "LOCAL_DIAGNOSTIC_ONLY", "productionCause": "UNKNOWN", "artifactSHA256": DIGEST, "caps": caps, "requests": 0}
    log = bytearray()
    process = None
    selector = selectors.DefaultSelector()

    def drain():
        for key, _ in selector.select(timeout=0.02):
            chunk = os.read(key.fileobj.fileno(), 65536)
            if not chunk:
                selector.unregister(key.fileobj)
            elif len(log) < LOG_LIMIT:
                remaining = LOG_LIMIT - len(log)
                log.extend(chunk[:remaining])
                if len(chunk) > remaining:
                    result["logOverflow"] = True
            else:
                result["logOverflow"] = True

    try:
        def interrupted(signum, _frame):
            raise InterruptedError(f"Interrupted by signal {signum}")

        signal.signal(signal.SIGTERM, interrupted)
        signal.signal(signal.SIGINT, interrupted)
        node = plan["tools"]["node"]["path"]
        argv = [node, plan["tools"]["wrangler"]["path"], "dev", "--local", "--ip", "127.0.0.1", "--port", str(PORT),
                "--config", str(root / "state/wrangler.json"), "--persist-to", str(root / "state")]
        require(time.monotonic() < work_deadline, "Active deadline exhausted before launch")
        process = subprocess.Popen(argv, cwd=root / "state", env=clean_environment(root, node), stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, start_new_session=True, preexec_fn=lambda: child_limits(uid, gid))
        result["workerPidPg"] = process.pid
        selector.register(process.stdout, selectors.EVENT_READ)
        ready = False
        while time.monotonic() < min(started + 20, work_deadline) and process.poll() is None and not result.get("logOverflow"):
            drain()
            try:
                with socket.create_connection(("127.0.0.1", PORT), timeout=0.1):
                    ready = True
                    break
            except OSError:
                pass
        require(ready, "LOCAL_TOOL_OR_BINDING_STARTUP_GAP")
        result["requests"] = 1
        requester = threading.Thread(target=request_once, args=(result,), daemon=True)
        requester.start()
        while not result.get("done") and time.monotonic() < work_deadline and not result.get("logOverflow"):
            drain()
        require(result.get("done") and not result.get("logOverflow"), "Request timeout or log overflow")
    except Exception as error:
        result["primaryError"] = str(error)
    finally:
        try:
            if process:
                close_group(process, drain, overall_deadline)
                result["workerExit"] = process.returncode
                result["groupAbsent"] = True
        except Exception as error:
            result["cleanupError"] = str(error)
        result["streamsComplete"] = not selector.get_map()
        selector.close()
        if process and process.stdout:
            process.stdout.close()
        result["deadlineExceeded"] = time.monotonic() >= overall_deadline
        result["elapsedSeconds"] = round(time.monotonic() - started, 3)
        result["diagnosticLines"] = diagnostic_lines(log)
        result["logBytes"] = len(log)
        result["logSHA256"] = hashlib.sha256(log).hexdigest()
        save(root / "diagnostic-result.json", result)
        os.chown(root / "diagnostic-result.json", root.stat().st_uid, root.stat().st_gid)
    return 1 if (result.get("primaryError") or result.get("cleanupError") or result.get("logOverflow")
                 or result["deadlineExceeded"] or not result["streamsComplete"]) else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["prepare", "run"])
    parser.add_argument("root", type=Path)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--node")
    args = parser.parse_args()
    root = args.root.resolve(strict=True)
    if args.mode == "prepare":
        prepare(root, args.source.resolve(strict=True), args.node)
        return 0
    try:
        return run(root)
    except Exception as error:
        save(root / "diagnostic-result.json", {"state": "PRELAUNCH_STOP", "error": str(error), "productionCause": "UNKNOWN", "requests": 0})
        os.chown(root / "diagnostic-result.json", root.stat().st_uid, root.stat().st_gid)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
