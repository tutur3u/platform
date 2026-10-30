#!/usr/bin/env python3
"""Hydrate Android development Firebase config without logging its contents."""
import json
import os
from pathlib import Path


def hydrate(raw, target):
    try:
        config = json.loads(raw)
        clients = config["client"]
        valid = (
            config["project_info"]["project_id"] == "tuturuuu-mobile-dev"
            and len(clients) == 1
            and clients[0]["client_info"]["mobilesdk_app_id"]
            == "1:90814255724:android:049567a22fe2e1b5283e49"
            and clients[0]["client_info"]["android_client_info"]["package_name"]
            == "com.tuturuuu.app.mobile.dev"
        )
    except (ValueError, KeyError, TypeError, IndexError):
        valid = False
    if not valid:
        raise ValueError("Missing or invalid development Firebase CI configuration")
    target.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        stream.write(raw)
    target.chmod(0o600)


if __name__ == "__main__":
    try:
        hydrate(
            os.environ.get("FIREBASE_DEVELOPMENT_GOOGLE_SERVICES_JSON", ""),
            Path("android/app/src/development/google-services.json"),
        )
    except ValueError:
        raise SystemExit("Missing or invalid development Firebase CI configuration") from None
