"""Nonshipping synthetic-only Linux namespace launcher. Never launches Next."""
import hashlib
import json
import os
from pathlib import Path
import platform
import resource
import shutil
import signal
import subprocess
import sys
import time


class Stop(RuntimeError):
    pass


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify(root, expected):
    # Explicit immutable allowlist, never execute an arbitrary supplied target.
    if set(expected) != {"fixture.py", "launcher.py"}:
        raise Stop("binding schema")
    for name, value in expected.items():
        path = root / name
        if path.is_symlink() or len(value) != 64 or digest(path) != value:
            raise Stop("source binding")


def capability():
    bwrap = shutil.which("bwrap")
    if platform.system() != "Linux" or not bwrap:
        raise Stop("Linux bubblewrap/user namespace capability absent")
    return bwrap


def limits():
    for key, value in [(resource.RLIMIT_CPU, 2), (resource.RLIMIT_AS, 268435456),
                       (resource.RLIMIT_FSIZE, 0), (resource.RLIMIT_NOFILE, 32),
                       (resource.RLIMIT_CORE, 0)]:
        resource.setrlimit(key, (value, value))


def command(bwrap, root, python):
    args = [bwrap, "--unshare-all", "--die-with-parent", "--new-session",
            "--cap-drop", "ALL", "--clearenv", "--ro-bind", "/usr", "/usr"]
    for path in ["/lib", "/lib64"]:
        if Path(path).exists():
            args += ["--ro-bind", path, path]
    # No home, /etc, repository, secrets, host sockets, or writable persistent mount.
    args += ["--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp",
             "--ro-bind", str(root), "/fixture", "--chdir", "/fixture",
             python, "-I", "-B", "/fixture/fixture.py"]
    return args


def run(expected, stage_ms, total_ms):
    if not (0 < stage_ms <= 5000 and 0 < total_ms <= 10000):
        raise Stop("unit fixture deadline bounds")
    start = time.monotonic()
    root = Path(__file__).resolve().parent
    verify(root, expected)
    bwrap = capability()
    python = str(Path(sys.executable).resolve())
    if not python.startswith("/usr/"):
        raise Stop("isolated system Python unavailable")
    deadline = min(start + total_ms / 1000, time.monotonic() + stage_ms / 1000)
    # PID namespace init owns descendants; its death tears down that namespace.
    process = subprocess.Popen(command(bwrap, root, python), env={}, stdin=subprocess.DEVNULL,
                               stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                               start_new_session=True, preexec_fn=limits)
    try:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise Stop("absolute deadline")
        output, _ = process.communicate(timeout=remaining)
        if process.returncode or len(output) > 4096:
            raise Stop("sandbox/canary failure")
        # Child output is never logged or included in an exception.
        if json.loads(output) != {"v": 1, "status": "CANARIES_VERIFIED", "count": 6}:
            raise Stop("canary schema")
        verify(root, expected)
        return {"v": 1, "status": "UNIT_CANARIES_ONLY", "nextRequests": 0,
                "fixture": expected["fixture.py"], "launcher": expected["launcher.py"]}
    except (subprocess.TimeoutExpired, ValueError) as error:
        raise Stop("deadline or schema") from error
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGKILL)
        process.wait()


if __name__ == "__main__":
    try:
        # No defaults, environment admission, target URL, or Next entrypoint.
        if len(sys.argv) != 4:
            raise Stop("expected manifest and explicit unit stage/total milliseconds")
        expected = json.loads(Path(sys.argv[1]).read_text())
        print(json.dumps(run(expected, int(sys.argv[2]), int(sys.argv[3]))))
    except Exception:
        print(json.dumps({"v": 1, "status": "STOP", "nextRequests": 0}))
        sys.exit(2)
