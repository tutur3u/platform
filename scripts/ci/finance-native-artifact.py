"""Qualify a Finance native artifact (staging by default) using the shared Apps seal/restore helper."""
import importlib.util
import json
import os
from pathlib import Path
from urllib.parse import urlsplit

APP_ROOT = Path(__file__).resolve().parents[2] / "apps/finance"
PROFILE_ENV = "VITE_FINANCE_NATIVE_PROFILE"
PROFILES = json.loads((APP_ROOT / "cloudflare/native-profiles.json").read_text())
DEV_COORDINATION_SECRET = "tuturuuu-local-development-app-coordination-secret"
SCANNED_SUFFIXES = (".js", ".mjs", ".cjs", ".css", ".json", ".html", ".txt")
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


def supabase_ref(selected):
    return urlsplit(selected["vars"]["NEXT_PUBLIC_SUPABASE_URL"]).hostname.split(".")[0]


def bundle_markers(name):
    """Values the selected profile's bundles must carry, and the other profile's that they must not."""
    selected = PROFILES[name]
    required = (supabase_ref(selected), selected["vars"]["NEXT_PUBLIC_WEB_APP_URL"])
    forbidden = []
    for other_name, other in PROFILES.items():
        if other_name == name:
            continue
        forbidden.append(supabase_ref(other))
        # Production must not reference staging Web or the staging root host;
        # staging legitimately carries production fallbacks (e.g. tuturuuu.com).
        if name == "production":
            forbidden += [other["vars"]["NEXT_PUBLIC_WEB_APP_URL"], other["rootHost"]]
    return required, tuple(forbidden)


def scan_bundles(dist, name):
    required, forbidden = bundle_markers(name)
    found = set()
    for path in sorted(Path(dist).rglob("*")):
        # Source maps embed every source module and are diagnostics, not executed code.
        if not path.is_file() or path.suffix not in SCANNED_SUFFIXES:
            continue
        text = path.read_text("utf-8", "replace")
        relative = path.relative_to(dist).as_posix()
        if DEV_COORDINATION_SECRET in text:
            raise ValueError("development coordination secret in bundle: " + relative)
        for marker in forbidden:
            if marker in text:
                raise ValueError(f"other profile's value in {name} bundle: {relative}")
        if relative.startswith("client/"):
            found.update(marker for marker in required if marker in text)
    missing = [marker for marker in required if marker not in found]
    if missing:
        raise ValueError(f"{name} browser bundle lacks its profile values: " + ", ".join(missing))


def load(name=None):
    name, selected = profile(name)
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
    validate_output = module.validate_output

    def validate_profile_output(directory, source=None):
        output = validate_output(directory, source)
        scan_bundles(output["app"] / "dist", name)
        return output

    module.validate_output = validate_profile_output
    return module


def main():
    if "FINANCE_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["FINANCE_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
