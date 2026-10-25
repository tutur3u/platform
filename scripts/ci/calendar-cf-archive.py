"""Validate comparison archive members before the workflow extracts any bytes."""

import pathlib
import re
import stat
import sys
import tarfile


def validate_archive(path):
    archive_path = pathlib.Path(path)
    if not stat.S_ISREG(archive_path.lstat().st_mode):
        raise ValueError("comparison archive must be a regular file")
    with tarfile.open(archive_path, "r:gz") as archive:
        members = archive.getmembers()
        if not members:
            raise ValueError("comparison archive is empty")
        paths = {}
        for member in members:
            name = member.name
            if (
                not name
                or name.startswith("/")
                or re.match(r"^[A-Za-z]:", name)
                or "\\" in name
                or ".." in name.split("/")
                or any(ord(character) < 32 for character in name)
            ):
                raise ValueError(f"unsafe comparison archive path: {name!r}")
            if not (member.isfile() or member.isdir()):
                raise ValueError(f"links and special archive entries forbidden: {name!r}")
            normalized = str(pathlib.PurePosixPath(name))
            if normalized == "." and not member.isdir():
                raise ValueError("archive root must be a directory")
            if normalized in paths:
                raise ValueError(f"duplicate comparison archive path: {name!r}")
            paths[normalized] = member.isdir()
        for name in paths:
            for parent in pathlib.PurePosixPath(name).parents:
                if str(parent) in paths and not paths[str(parent)]:
                    raise ValueError(f"archive file used as directory: {name!r}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: calendar-cf-archive.py <archive.tar.gz>")
    validate_archive(sys.argv[1])
