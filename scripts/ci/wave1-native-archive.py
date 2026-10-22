"""Bounded, path-preserving native artifact archive; reject links before extraction."""
import argparse
from pathlib import Path, PurePosixPath
import tarfile
import shutil

MAX_BYTES = 1024 ** 3
MAX_FILES = 50000


def require(value, message):
    if not value:
        raise ValueError(message)


def inspect(members):
    require(len(members) <= MAX_FILES, "archive file budget exceeded")
    names = set()
    total = 0
    for member in members:
        name = member.name
        path = PurePosixPath(name)
        require(len(name) <= 4096, "archive member name exceeded budget")
        require(name and not path.is_absolute() and "\\" not in name, "invalid member")
        require(".." not in path.parts and path.as_posix() == name.rstrip("/"), "unsafe member")
        require(name not in names, "duplicate member")
        names.add(name)
        require(path.parts[0] in ("dist", "wave1-artifact.json"), "unexpected member")
        require(member.isfile() or member.isdir(), "links or special files forbidden")
        hidden = any(part.startswith(".") for part in path.parts)
        require(not hidden or name in (
            "dist/client/.assetsignore", "dist/server/.vite",
            "dist/server/.vite/manifest.json"), "hidden file forbidden")
        total += member.size
        require(total <= MAX_BYTES, "archive byte budget exceeded")
    require("wave1-artifact.json" in names, "missing seal")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("pack", "restore"))
    parser.add_argument("app")
    parser.add_argument("archive")
    args = parser.parse_args()
    app = Path(args.app).resolve()
    if args.mode == "pack":
        # Artifact inventory must pass before this command. Tar never dereferences links.
        with tarfile.open(args.archive, "w:gz", dereference=False) as archive:
            archive.add(app / "dist", arcname="dist")
            archive.add(app / "wave1-artifact.json", arcname="wave1-artifact.json")
        with tarfile.open(args.archive, "r:gz") as archive:
            inspect(archive.getmembers())
    else:
        require(not (app / "dist").exists(), "restore requires absent dist")
        require(not (app / "wave1-artifact.json").exists(), "restore requires absent seal")
        with tarfile.open(args.archive, "r:gz") as archive:
            members = archive.getmembers()
            inspect(members)
            # Explicit regular-file extraction works on supported older Python too.
            for member in members:
                target = app.joinpath(*PurePosixPath(member.name).parts)
                if member.isdir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.extractfile(member) as source, target.open("xb") as dest:
                        shutil.copyfileobj(source, dest, length=1024 * 1024)


if __name__ == "__main__":
    main()
