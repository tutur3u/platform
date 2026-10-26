"""Validate and preserve the Tasks staging artifact; never deploy.

Reuses the reviewed Apps seal/restore implementation with the Worker identity
apps/tasks/void.config.ts declares: root-only (no workers.dev route), the
strict public fetch flag, no vars (the Worker always sends the Tasks SEO
policy's robots header), no observability block, and static assets served
with html_handling "none".
"""
import importlib.util
import os
from pathlib import Path

WORKER = "tuturuuu-tasks-vite-staging"
PUBLIC_ROOT = Path(__file__).resolve().parents[2] / "apps/tasks/public"
PUBLIC_FILES = tuple(sorted(
    path.relative_to(PUBLIC_ROOT).as_posix()
    for path in PUBLIC_ROOT.rglob("*") if path.is_file()
))


def load():
    source = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("tasks_native_artifact_base", source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    identity = {k: v for k, v in module.IDENTITY.items() if k != "observability"}
    module.IDENTITY = {
        **identity,
        "name": WORKER,
        "compatibility_date": "2026-10-19",
        "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
        "workers_dev": False,
        "vars": {},
    }
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": WORKER}
    # The offline worker precaches the exact /offline.html: serve it without
    # the default html_handling's internal redirect to /offline.
    module.ASSET_POLICY = {**module.ASSET_POLICY, "html_handling": "none"}
    module.RECEIPT = "tasks-native-artifact.json"
    module.PUBLIC_FILES = PUBLIC_FILES
    return module


def main():
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if "TASKS_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["TASKS_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
