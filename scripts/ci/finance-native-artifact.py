"""Qualify Finance's staging artifact using the shared Apps seal/restore helper."""
import importlib.util
import os
from pathlib import Path

WORKER = "tuturuuu-finance-vite-staging"
PUBLIC_ROOT = Path(__file__).resolve().parents[2] / "apps/finance/public"
PUBLIC_FILES = tuple(sorted(
    path.relative_to(PUBLIC_ROOT).as_posix()
    for path in PUBLIC_ROOT.rglob("*") if path.is_file()
))


def load():
    source = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("finance_artifact_base", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.IDENTITY = {**module.IDENTITY, "name": WORKER}
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": WORKER}
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
