"""Validate and preserve a Shortener native artifact (staging by default); never deploy.

Reuses the reviewed Apps seal/restore implementation with Shortener's own
Worker identity, public files and source-SHA channel.
"""
import importlib.util
import json
import os
from pathlib import Path

PROFILE_ENV = "VITE_SHORTENER_NATIVE_PROFILE"
PROFILES = json.loads((Path(__file__).resolve().parents[2] / "apps/shortener/cloudflare/native-profiles.json").read_text())
PUBLIC_FILES = (
    "android-chrome-192x192.png",
    "android-chrome-512x512.png",
    "apple-touch-icon.png",
    "favicon-16x16.png",
    "favicon-32x32.png",
    "favicon.ico",
    "robots.txt",
    "site.webmanifest",
)


def load(name=None):
    name = name if name is not None else os.environ.get(PROFILE_ENV) or "staging"
    if name not in PROFILES:
        raise ValueError(f"unknown {PROFILE_ENV}: {name}")
    selected = PROFILES[name]
    worker = selected["workerName"]
    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("shortener_native_artifact_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.IDENTITY = {**module.IDENTITY, "name": worker, "workers_dev": selected["workersDev"], "vars": dict(selected["vars"])}
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": worker}
    module.RECEIPT = "shortener-native-artifact.json"
    module.PUBLIC_FILES = PUBLIC_FILES
    return module


def main():
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if "SHORTENER_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["SHORTENER_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
