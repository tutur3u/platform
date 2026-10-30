"""Validate and preserve the Mastermind staging artifact; never deploy.

Reuses the reviewed Apps seal/restore implementation with Mastermind's own
Worker identity, public files and source-SHA channel.
"""
import importlib.util
import os
from pathlib import Path

WORKER = "tuturuuu-mastermind"
PUBLIC_FILES = ()


def load():
    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("mastermind_native_artifact_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.IDENTITY = {**module.IDENTITY, "name": WORKER, "workers_dev": False, "preview_urls": False, "vars": {}, "observability": {"enabled": False}}
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": WORKER}
    module.RECEIPT = "mastermind-native-artifact.json"
    module.PUBLIC_FILES = PUBLIC_FILES
    return module


def main():
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if "MASTERMIND_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["MASTERMIND_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
