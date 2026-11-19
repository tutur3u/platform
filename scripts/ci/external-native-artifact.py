"""Validate and preserve External's emitted Worker without publication."""

import importlib.util
import os
from pathlib import Path


def main():
    profile = os.environ.get("VITE_EXTERNAL_NATIVE_PROFILE", "staging")
    if profile not in ("staging", "production"):
        raise ValueError("Unknown External native profile")
    worker = "tuturuuu-external" if profile == "production" else "tuturuuu-external-vite-staging"

    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("external_native_artifact_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.IDENTITY = {
        **module.IDENTITY,
        "name": worker,
        "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
        "workers_dev": False,
        "preview_urls": False,
    }
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": worker}
    module.RECEIPT = "external-native-artifact.json"
    module.PUBLIC_FILES = ("file.svg", "globe.svg", "next.svg", "robots.txt", "vercel.svg", "window.svg")
    if "EXTERNAL_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["EXTERNAL_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    module.main()


if __name__ == "__main__":
    main()
