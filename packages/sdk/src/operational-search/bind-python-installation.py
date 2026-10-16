"""Bind an already hash-locked, isolated wheel install before any model load."""
import argparse
import hashlib
import json
import os
from pathlib import Path


def sha256(path):
    result = hashlib.sha256()
    with path.open("rb") as source:
        while block := source.read(65536):
            result.update(block)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    root = Path(args.root).resolve(strict=True)
    if root.stat().st_mode & 0o077:
        raise ValueError("runtime root must be private")
    venv = root / "venv"
    executable = (venv / "bin/python").resolve(strict=True)
    configuration = dict(line.split(" = ", 1) for line in (venv / "pyvenv.cfg").read_text().splitlines() if " = " in line)
    if configuration.get("include-system-site-packages") != "false" or configuration.get("version") != "3.12.15":
        raise ValueError("runtime configuration differs from the approved ABI")
    packages = venv / "lib/python3.12/site-packages"
    files = []
    for path in sorted(packages.rglob("*")):
        if path.is_symlink():
            raise ValueError("installed runtime contains a symlink")
        if path.is_file():
            files.append({"path": str(path.relative_to(venv)), "sha256": sha256(path)})
    if not 1 <= len(files) <= 2000:
        raise ValueError("installed file count exceeds bound")
    manifest = {"version": 1, "platform": "darwin-arm64", "python": "3.12.15",
                "interpreter": {"path": str(executable), "sha256": sha256(executable)},
                "configuration": {key: configuration[key] for key in ["home", "include-system-site-packages", "version", "executable"]},
                "files": files,
                "authority": "Generated from the task-owned isolated install of the exact publisher hash-locked wheels before any model load."}
    fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as output:
        json.dump(manifest, output, indent=2)
        output.write("\n")
        output.flush()
        os.fsync(output.fileno())
    print(json.dumps({"boundFiles": len(files), "interpreterSha256": manifest["interpreter"]["sha256"], "modelLoaded": False}))


if __name__ == "__main__":
    main()
