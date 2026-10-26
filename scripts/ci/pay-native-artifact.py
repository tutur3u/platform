"""Validate and preserve the pay staging artifact; never deploy.

Reuses the reviewed Apps seal/restore implementation with this app's Worker
identity, public files and source-SHA channel.
"""
import importlib.util
import json
import os
from pathlib import Path

WORKER = "tuturuuu-pay-vite-staging"
PROFILE = Path(__file__).resolve().parents[2] / "apps/pay/cloudflare/staging-profile.json"
PUBLIC_FILES = (
    "robots.txt",
)


def load():
    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("pay_native_artifact_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    profile = json.loads(PROFILE.read_text())
    if profile.get("POLAR_SANDBOX") != "true":
        raise RuntimeError("Pay staging qualification requires Polar sandbox")
    module.IDENTITY = {
        **module.IDENTITY,
        "name": WORKER,
        "workers_dev": False,
        "vars": profile,
        "compatibility_date": "2026-10-12",
        "compatibility_flags": ["nodejs_compat","global_fetch_strictly_public"],
    }
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": WORKER}
    module.RECEIPT = "pay-native-artifact.json"
    module.PUBLIC_FILES = PUBLIC_FILES
    return module


def main():
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if "PAY_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["PAY_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
