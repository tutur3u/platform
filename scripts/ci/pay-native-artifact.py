"""Validate and preserve the pay staging artifact; never deploy.

Reuses the reviewed Apps seal/restore implementation with this app's Worker
identity, public files and source-SHA channel.
"""
import importlib.util
import json
import os
import re
from pathlib import Path

WORKER = "tuturuuu-pay-vite-staging"
PROFILE = Path(__file__).resolve().parents[2] / "apps/pay/cloudflare/native-profiles.json"
PUBLIC_FILES = (
    "robots.txt",
)
PRODUCTION = False

# Staging hostnames reach every production bundle only through the shared
# fail-closed allowlists (cookie-domain override, staging app registry), which
# are inert on production. Any other staging host in the output is a leaked
# runtime value. The tokens below are the exact hostname spellings those
# allowlists compile to (plus the doc-comment examples source maps carry).
STAGING_ZONE = "tutur3u.com"
STAGING_HOST_TOKEN = re.compile(rb"[a-z0-9._-]*tutur3u\.com")
ALLOWLIST_STAGING_TOKENS = frozenset({
    b".staging.tutur3u.com",
    b".tutur3u.com",
    b".foo.tutur3u.com",
})


def staging_host_leaks(content):
    """Staging hostname tokens outside the compiled allowlist spellings."""
    return sorted({
        token.decode() for token in STAGING_HOST_TOKEN.findall(content.lower())
        if token not in ALLOWLIST_STAGING_TOKENS
    })


def reject_staging_production(directory, output):
    if not PRODUCTION:
        return
    config = json.loads(output["config"].read_text())
    vars_ = config.get("vars", {})
    if vars_.get("NEXT_PUBLIC_WEB_APP_URL") != "https://tuturuuu.com":
        raise ValueError("production NEXT_PUBLIC_WEB_APP_URL must be https://tuturuuu.com")
    staging = json.loads(PROFILE.read_text())["staging"]["vars"]
    # Runtime configuration never tolerates a staging host, allowlists included.
    if STAGING_ZONE in json.dumps(config).lower():
        raise ValueError("staging marker in production config: " + STAGING_ZONE)
    markers = set()
    staging_url = staging.get("NEXT_PUBLIC_SUPABASE_URL", "")
    if ".supabase.co" in staging_url:
        markers.add(staging_url.removeprefix("https://").removesuffix(".supabase.co"))
    # The Polar environment is chosen at runtime from these vars. Bundles carry
    # the SDK's sandbox server table, the checkout embed origins and setup copy,
    # so the bundle text is not evidence of the selected server.
    if str(vars_.get("POLAR_SANDBOX", "")).lower() != "false":
        raise ValueError("production POLAR_SANDBOX must be false")
    if "sandbox" in str(vars_.get("POLAR_SERVER", "")).lower():
        raise ValueError("production Polar server must not use sandbox")
    for path in (output["assets"], output["main"]):
        files = [path] if path.is_file() else sorted(p for p in path.rglob("*") if p.is_file())
        for file in files:
            content = file.read_bytes().lower()
            for marker in markers:
                if marker.lower().encode() in content:
                    raise ValueError("staging marker in production output: " + marker)
            leaks = staging_host_leaks(content)
            if leaks:
                raise ValueError("staging marker in production output: " + ", ".join(leaks))


def load():
    path = Path(__file__).with_name("apps-native-artifact.py")
    spec = importlib.util.spec_from_file_location("pay_native_artifact_base", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    profiles = json.loads(PROFILE.read_text())
    profile = profiles["staging"]["vars"]
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
            "NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN": ".tuturuuu.com",
            "INTERNAL_WEB_API_ORIGIN": "https://tuturuuu.com",
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
