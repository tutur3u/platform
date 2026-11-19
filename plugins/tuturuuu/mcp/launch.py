"""Start the read bridge with an isolated, hash-locked environment when needed."""
from __future__ import annotations

import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory


def environment_python() -> Path:
    lock = Path(__file__).with_name("requirements.lock")
    digest = hashlib.sha256(lock.read_bytes()).hexdigest()
    cache = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    cache = cache / "tuturuuu" / "readonly-mcp"
    cache.mkdir(parents=True, exist_ok=True)
    environment = cache / digest
    executable = Path("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if (environment / executable).is_file():
        return environment / executable

    uv = shutil.which("uv")
    if not uv:
        for candidate in (
            Path.home() / ".local/bin/uv",
            Path.home() / ".cargo/bin/uv",
            Path("/opt/homebrew/bin/uv"),
            Path("/usr/local/bin/uv"),
        ):
            if os.access(candidate, os.X_OK):
                uv = str(candidate)
                break
    if not uv:
        raise RuntimeError("Install uv to provision the Tuturuuu read-only MCP dependencies.")

    with TemporaryDirectory(dir=cache) as scratch:
        staged = Path(scratch) / "environment"
        subprocess.run([uv, "venv", "--python", "3.12", str(staged)],
                       check=True, stdout=sys.stderr, stdin=subprocess.DEVNULL)
        subprocess.run(
            [uv, "pip", "sync", "--require-hashes", "--python",
             str(staged / executable), str(lock)],
            check=True, stdout=sys.stderr, stdin=subprocess.DEVNULL,
        )
        try:
            staged.rename(environment)
        except OSError:
            if not (environment / executable).is_file():
                raise
    return environment / executable


def main() -> None:
    server = Path(__file__).with_name("server.py")
    python = sys.executable
    if importlib.util.find_spec("mcp") is None:
        python = str(environment_python())
    os.execv(python, [python, str(server)])


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(f"tuturuuu-readonly startup failed: {error}")
