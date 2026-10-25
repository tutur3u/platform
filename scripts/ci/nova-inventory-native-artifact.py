"""Seal Nova or Inventory output using the reviewed Apps artifact contract.

This is a local qualification helper. It does not deploy or admit production.
"""
import argparse
import importlib.util
import os
from pathlib import Path
import sys

APPS = ("nova", "inventory")
ROOT = Path(__file__).resolve().parents[2]


def load(app):
    if app not in APPS:
        raise ValueError("unsupported app")
    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location(f"{app}_artifact_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    worker = f"tuturuuu-{app}-vite-staging"
    module.IDENTITY = {**module.IDENTITY, "name": worker}
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": worker}
    module.RECEIPT = f"{app}-native-artifact.json"
    public = ROOT / "apps" / app / "public"
    paths = sorted(public.rglob("*"))
    if any(path.is_symlink() for path in paths):
        raise ValueError("public asset symlink forbidden")
    module.PUBLIC_FILES = tuple(
        path.relative_to(public).as_posix() for path in paths if path.is_file()
    )
    return module


def main():
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("app", choices=APPS)
    args, remaining = parser.parse_known_args()
    # Do not accept an unrelated app's source channel as this lane's proof.
    sha = os.environ.get("START_BRIDGE_SOURCE_SHA")
    if sha is None:
        os.environ.pop("APPS_SOURCE_SHA", None)
    else:
        os.environ["APPS_SOURCE_SHA"] = sha
    sys.argv = [sys.argv[0], *remaining]
    load(args.app).main()


if __name__ == "__main__":
    main()
