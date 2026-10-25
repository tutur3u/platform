"""Validate and preserve the Passwords Worker artifact; never deploy.

Reuses the reviewed Apps seal/restore implementation with the Passwords Worker
identity. The first CI run proves the emitted field shapes (`config` subcommand)
before the seal is trusted.
"""
import importlib.util
import os
from pathlib import Path

WORKER = "tuturuuu-passwords"
PUBLIC_FILES = ("favicon.ico", "site.webmanifest")
IDENTITY = {
    "name": WORKER,
    "compatibility_date": "2026-10-12",
    "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
    "workers_dev": False,
    "observability": {
        "enabled": True,
        "head_sampling_rate": 0.05,
        "logs": {"invocation_logs": False},
    },
    "vars": {
        "PASSWORDS_ENABLED": "false",
        "NEXT_PUBLIC_APP_URL": "https://passwords.tuturuuu.com",
        "NEXT_PUBLIC_WEB_APP_URL": "https://tuturuuu.com",
    },
}


def load():
    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("passwords_native_artifact_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.IDENTITY = {**module.IDENTITY, **IDENTITY}
    module.NORMALIZED_DEFAULTS = {**module.NORMALIZED_DEFAULTS, "topLevelName": WORKER}
    module.RECEIPT = "passwords-native-artifact.json"
    module.PUBLIC_FILES = PUBLIC_FILES
    return module


def main():
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if "PASSWORDS_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["PASSWORDS_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
