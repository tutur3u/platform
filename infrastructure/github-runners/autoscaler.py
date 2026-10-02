#!/usr/bin/env python3
"""A bounded, repository-scoped queue poller for ephemeral Docker runners."""
import argparse
import datetime as dt
import json
import logging
import os
from pathlib import Path
import signal
import subprocess
import threading
import time
import uuid

LOG = logging.getLogger("runner-autoscaler")
STOP = threading.Event()


def command(args, *, data=None, check=True):
    result = subprocess.run(args, input=data, capture_output=True, text=True,
                            timeout=90)
    if check and result.returncode:
        # Never include command arguments, input, or stdout: they can contain JIT secrets.
        raise RuntimeError(f"{args[0]} failed (exit {result.returncode}): {result.stderr[:500]}")
    return result


def api(path, method="GET", body=None):
    args = ["gh", "api", path, "--method", method]
    if body is not None:
        args += ["--input", "-"]
    result = command(args, data=json.dumps(body) if body is not None else None)
    return json.loads(result.stdout) if result.stdout.strip() else None


def pages(path, key):
    page = 1
    while True:
        sep = "&" if "?" in path else "?"
        values = api(f"{path}{sep}per_page=100&page={page}")[key]
        yield from values
        if len(values) < 100:
            return
        page += 1


def trusted(run, repo):
    return (run.get("event") in {"push", "workflow_dispatch", "schedule"}
            and (run.get("head_repository") or {}).get("full_name") == repo)


def queued_jobs(repo, label):
    count = 0
    available = {"self-hosted", "linux", "x64", label.lower()}
    for status in ("queued", "in_progress"):
        for run in pages(f"repos/{repo}/actions/runs?status={status}", "workflow_runs"):
            if not trusted(run, repo):
                continue
            for job in pages(f"repos/{repo}/actions/runs/{run['id']}/jobs?filter=latest", "jobs"):
                labels = {value.lower() for value in job.get("labels", [])}
                if job["status"] == "queued" and label.lower() in labels and labels <= available:
                    count += 1
    return count


def containers(config):
    result = command(["docker", "ps", "-a", "--filter", f"label=tuturuuu.pool={config['pool']}",
                      "--format", "{{.ID}}"])
    ids = result.stdout.split()
    if not ids:
        return []
    template = '{{json .Name}} {{json .State}} {{json .Config.Labels}} {{json .Created}}'
    result = command(["docker", "inspect", "--format", template, *ids])
    values = []
    decoder = json.JSONDecoder()
    for cid, line in zip(ids, result.stdout.splitlines()):
        fields = []
        rest = line
        for _ in range(4):
            value, end = decoder.raw_decode(rest.lstrip())
            fields.append(value)
            rest = rest.lstrip()[end:]
        name, state, labels, created = fields
        born = dt.datetime.fromisoformat(created[:26] + "+00:00").timestamp()
        values.append({"id": cid, "name": name.lstrip("/"), "state": state,
                       "labels": labels, "age": time.time() - born})
    return values


def remove_runner(repo, runner_id):
    result = command(["gh", "api", f"repos/{repo}/actions/runners/{runner_id}",
                      "--method", "DELETE"], check=False)
    if result.returncode and "HTTP 404" not in result.stderr:
        LOG.warning("Cannot deregister runner %s; retaining container", runner_id)
        return False
    return True


def retire(config, container):
    runner_id = container["labels"]["tuturuuu.runner-id"]
    if not remove_runner(config["repository"], runner_id):
        return False
    logs = command(["docker", "logs", "--tail", "2000", container["id"]], check=False)
    directory = Path(config["state_dir"]) / "logs"
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    (directory / (container["name"] + ".log")).write_text(logs.stdout + logs.stderr)
    command(["docker", "rm", "-f", container["id"]])
    LOG.info("Retired %s", container["name"])
    return True


def room(config):
    memory = dict(line.split(":", 1) for line in Path("/proc/meminfo").read_text().splitlines())
    available = int(memory["MemAvailable"].strip().split()[0]) * 1024
    disk = os.statvfs(config["state_dir"])
    return (available >= (config["memory_gib"] + config["reserve_memory_gib"]) * 1024**3
            and disk.f_bavail * disk.f_frsize >= config["reserve_disk_gib"] * 1024**3)


def start(config):
    name = f"{config['pool']}-{int(time.time())}-{uuid.uuid4().hex[:8]}"
    jit = api(f"repos/{config['repository']}/actions/runners/generate-jitconfig", "POST", {
        "name": name, "runner_group_id": 1,
        "labels": ["self-hosted", "Linux", "X64", config["label"]], "work_folder": "_work",
    })
    runner_id = jit["runner"]["id"]
    # The one-job credential is supplied over stdin, never stored in files or argv.
    # Only the container metadata contains it; host GitHub credentials are never passed.
    args = ["docker", "run", "-d", "--name", name, "--init", "--user", "runner",
            "--cpus", str(config["cpus"]), "--memory", f"{config['memory_gib']}g",
            "--memory-swap", f"{config['memory_gib']}g", "--pids-limit", "1024",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
            "--network", config["network"], "--log-opt", "max-size=10m", "--log-opt", "max-file=2",
            "--label", f"tuturuuu.pool={config['pool']}",
            "--label", f"tuturuuu.runner-id={runner_id}",
            "--env-file", "/dev/stdin", config["image"], "/home/runner/run.sh"]
    try:
        command(args, data=f"ACTIONS_RUNNER_INPUT_JITCONFIG={jit['encoded_jit_config']}\n")
    except Exception:
        remove_runner(config["repository"], runner_id)
        command(["docker", "rm", "-f", name], check=False)
        raise
    LOG.info("Started %s (runner id %s)", name, runner_id)


def tick(config):
    repo = config["repository"]
    runners = {r["name"]: r for r in pages(f"repos/{repo}/actions/runners", "runners")}
    current = containers(config)
    active = []
    for container in current:
        runner = runners.get(container["name"], {})
        busy = runner.get("busy", False)
        dead = not container["state"]["Running"]
        expired = not busy and container["age"] > config["idle_timeout"]
        if (dead or expired) and retire(config, container):
            continue
        active.append(container)
    # Recover registrations stranded by a controller crash during Docker startup.
    names = {c["name"] for c in active}
    for name, runner in runners.items():
        if name.startswith(config["pool"] + "-") and name not in names and not runner["busy"]:
            try:
                age = time.time() - int(name[len(config["pool"]) + 1:].split("-")[0])
            except ValueError:
                continue
            if age > config["idle_timeout"]:
                remove_runner(repo, runner["id"])
    queued = queued_jobs(repo, config["label"])
    idle = sum(not runners.get(c["name"], {}).get("busy", False) for c in active)
    needed = max(0, min(config["max_runners"] - len(active), queued - idle))
    started = 0
    for _ in range(needed):
        if not room(config):
            LOG.warning("Host memory/disk reserve reached; delaying scale-up")
            break
        start(config)
        started += 1
    state = {"updated_at": dt.datetime.now(dt.timezone.utc).isoformat(), "queued_jobs": queued,
             "active_runners": len(active) + started, "max_runners": config["max_runners"],
             "label": config["label"]}
    path = Path(config["state_dir"]) / "status.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n")
    temporary.replace(path)
    for log in (Path(config["state_dir"]) / "logs").glob("*.log"):
        if time.time() - log.stat().st_mtime > 7 * 86400:
            log.unlink()
    LOG.info("Queue=%s active=%s max=%s", queued, state["active_runners"], config["max_runners"])


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    config = json.loads(Path(args.config).read_text())
    if not (1 <= config["max_runners"] <= 4 and config["cpus"] > 0 and config["memory_gib"] > 0):
        raise ValueError("Invalid limits (this host pool is capped at four runners)")
    Path(config["state_dir"]).mkdir(parents=True, exist_ok=True, mode=0o700)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    signal.signal(signal.SIGTERM, lambda *_: STOP.set())
    signal.signal(signal.SIGINT, lambda *_: STOP.set())
    while not STOP.is_set():
        try:
            tick(config)
        except Exception as error:
            LOG.error("Reconciliation failed: %s", error)
            if args.once:
                raise
        if args.once:
            break
        STOP.wait(config["poll_seconds"])
    # Leave running jobs intact across controller upgrades/restarts.


if __name__ == "__main__":
    main()
