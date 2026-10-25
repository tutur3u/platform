"""Validate and preserve the Passwords Worker artifact; never deploy.

Reuses the reviewed Apps seal/restore implementation with the Passwords Worker
identity. The first CI run proves the emitted field shapes (`config` subcommand)
before the seal is trusted.
"""
import importlib.util
import os
import json
import sys
from pathlib import Path

WORKER = "tuturuuu-passwords"
PUBLIC_FILES = ("favicon.ico", "site.webmanifest")
IDENTITY = {
    "name": WORKER,
    "secrets": {"required": [
        "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_SECRET_KEY", "TUTURUUU_APP_COORDINATION_SECRET", "ENCRYPTION_MASTER_KEY",
    ]},
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


def prepare(directory):
    # Void emits public build inputs for local preview; never seal that env file.
    path = Path(directory) / "dist/server/.dev.vars"
    if not path.exists():
        return
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 4096:
        raise ValueError("invalid build environment artifact")
    expected = {
        "NEXT_PUBLIC_SUPABASE_URL": "https://passwords-ci.supabase.invalid",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": "sb_publishable_passwords_ci_placeholder",
    }
    found = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or key not in expected or key in found:
            raise ValueError("unreviewed build environment key")
        try:
            found[key] = json.loads(value) if value.startswith('"') else value
        except (ValueError, TypeError):
            raise ValueError("invalid build environment encoding") from None
    if found != expected:
        raise ValueError("unreviewed build environment value")
    path.unlink()


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "prepare":
        prepare(sys.argv[2])
        return
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if "PASSWORDS_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["PASSWORDS_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
