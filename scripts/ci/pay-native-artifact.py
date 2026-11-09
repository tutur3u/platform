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
PRODUCTION = False


def reject_staging_production(directory, output):
    if not PRODUCTION:
        return
    config = json.loads(output["config"].read_text())
    vars_ = config.get("vars", {})
    if vars_.get("NEXT_PUBLIC_WEB_APP_URL") != "https://tuturuuu.com":
        raise ValueError("production NEXT_PUBLIC_WEB_APP_URL must be https://tuturuuu.com")
    staging = json.loads(PROFILE.read_text())
    markers = {"tutur3u.com"}
    staging_url = staging.get("NEXT_PUBLIC_SUPABASE_URL", "")
    if ".supabase.co" in staging_url:
        markers.add(staging_url.removeprefix("https://").removesuffix(".supabase.co"))
    if "sandbox" in str(config.get("vars", {}).get("POLAR_SERVER", "")).lower():
        raise ValueError("production Polar server must not use sandbox")
    for path in (output["assets"], output["main"]):
        files = [path] if path.is_file() else sorted(p for p in path.rglob("*") if p.is_file())
        for file in files:
            content = file.read_bytes().lower()
            for marker in markers:
                if marker.lower().encode() in content:
                    raise ValueError("staging marker in production output: " + marker)
            if b"sandbox" in content and (b"polar" in content or b"server" in content):
                raise ValueError("production Polar server must not use sandbox")


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
    if PRODUCTION:
        module.IDENTITY["vars"] = {
            "TUTURUUU_NOINDEX": "0", "NODE_ENV": "production",
            "TUTURUUU_REQUIRE_SECRETS": "1",
            "NEXT_PUBLIC_APP_URL": "https://pay.tuturuuu.com",
            "NEXT_PUBLIC_WEB_APP_URL": "https://tuturuuu.com",
            "NEXT_PUBLIC_SUPABASE_URL": os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "https://production-placeholder.supabase.co"),
            "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_production_placeholder"),
            "POLAR_SANDBOX": "false",
        }
    module.RECEIPT = "pay-native-artifact.json"
    module.PUBLIC_FILES = PUBLIC_FILES
    original_validate = module.validate_output

    def validate_output(directory, source=None):
        output = original_validate(directory, source)
        reject_staging_production(directory, output)
        return output

    module.validate_output = validate_output
    return module


def main():
    import sys
    production = False
    if "--profile" in sys.argv:
        index = sys.argv.index("--profile")
        del sys.argv[index]
        if index >= len(sys.argv) or sys.argv.pop(index) != "production":
            raise SystemExit("only the production artifact profile is supported")
        production = True
    global PRODUCTION
    PRODUCTION = production
    global WORKER
    if production:
        WORKER = "tuturuuu-pay"
    # The shared CLI reads its exact source from APPS_SOURCE_SHA.
    if "PAY_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["PAY_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    load().main()


if __name__ == "__main__":
    main()
