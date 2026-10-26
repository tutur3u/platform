"""Qualify a Finance native artifact (staging by default) using the shared Apps seal/restore helper."""
import importlib.util
import json
import os
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[2] / "apps/finance"
PROFILE_ENV = "VITE_FINANCE_NATIVE_PROFILE"
PROFILES = json.loads((APP_ROOT / "cloudflare/native-profiles.json").read_text())
PUBLIC_ROOT = APP_ROOT / "public"
PUBLIC_FILES = tuple(sorted(
    path.relative_to(PUBLIC_ROOT).as_posix()
    for path in PUBLIC_ROOT.rglob("*") if path.is_file()
))


def profile(name=None):
    name = name if name is not None else os.environ.get(PROFILE_ENV) or "staging"
    if name not in PROFILES:
        raise ValueError(f"unknown {PROFILE_ENV}: {name}")
    return name, PROFILES[name]


def load(name=None):
    _, selected = profile(name)
    worker = selected["workerName"]
    source = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("finance_artifact_base", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.IDENTITY = {
        **module.IDENTITY, "name": worker, "workers_dev": False,
        "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
        "vars": dict(selected["vars"]),
    }
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": worker}
    module.RECEIPT = "finance-native-artifact.json"
    module.PUBLIC_FILES = PUBLIC_FILES
    return module


def main():
    if "FINANCE_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["FINANCE_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
