#!/usr/bin/env python3
"""Prepare or verify development-only Apple Firebase resources without logging values."""

import argparse
import plistlib
import shutil
from pathlib import Path

REQUIRED = (
    "CLIENT_ID", "REVERSED_CLIENT_ID", "API_KEY", "GCM_SENDER_ID",
    "GOOGLE_APP_ID", "BUNDLE_ID", "PROJECT_ID",
)


def load_config(path):
    try:
        config = plistlib.loads(path.read_bytes())
    except (OSError, ValueError, plistlib.InvalidFileException):
        raise ValueError("Missing or invalid Firebase service plist") from None
    if not isinstance(config, dict) or any(
        not isinstance(config.get(key), str) or not config[key].strip()
        or "dummy" in config[key].lower() for key in REQUIRED
    ):
        raise ValueError("Firebase service plist lacks valid required fields")
    return config


def configure(platform, mobile_root, app=None):
    source = mobile_root / platform / "Runner/GoogleService-Info-development.plist"
    expected = load_config(source)
    if app is None:
        shutil.copyfile(source, mobile_root / platform / "Runner/GoogleService-Info.plist")
        return
    resource = app / ("Contents/Resources" if platform == "macos" else "")
    if load_config(resource / "GoogleService-Info.plist") != expected:
        raise ValueError("Packaged Firebase configuration does not match development flavor")
    info = load_info(app / ("Contents/Info.plist" if platform == "macos" else "Info.plist"))
    if info.get("CFBundleIdentifier") != expected["BUNDLE_ID"]:
        raise ValueError("Packaged app and Firebase bundle identities differ")


def load_info(path):
    try:
        info = plistlib.loads(path.read_bytes())
        if isinstance(info, dict):
            return info
    except (OSError, ValueError, plistlib.InvalidFileException):
        pass
    raise ValueError("Missing or invalid packaged app Info.plist")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--platform", choices=("ios", "macos"), required=True)
    parser.add_argument("--mobile-root", type=Path, default=Path.cwd())
    parser.add_argument("--app", type=Path)
    args = parser.parse_args()
    try:
        configure(args.platform, args.mobile_root, args.app)
    except ValueError as error:
        parser.exit(1, f"{error}\n")
