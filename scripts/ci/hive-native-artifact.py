# Retired legacy checker; not invoked by the Hive artifact workflow.
"""Historical staging seal/restore checker, retained as source only.

Current acceptance uses native-auth.runtime.mjs and emitted-config receipts.
This retired helper is not evidence for the current production artifact.
"""
import importlib.util
import os
from pathlib import Path

WORKER = "tuturuuu-hive"
PUBLIC_FILES = (
    "assets/hive/hive-voxel-asset-sheet.png",
    "hive-landing-reference.png",
    "robots.txt",
)


def load():
    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("hive_native_artifact_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.IDENTITY = {
        **module.IDENTITY,
        "name": WORKER,
        "compatibility_date": "2026-10-12",
        "compatibility_flags": ["nodejs_compat","global_fetch_strictly_public"],
        "workers_dev": False,
        "preview_urls": False,
    }
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": WORKER}
    module.RECEIPT = "hive-native-artifact.json"
    module.PUBLIC_FILES = PUBLIC_FILES
    return module


def main():
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if "HIVE_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["HIVE_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
