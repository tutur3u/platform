"""Check Runner Keychain groups in source configurations and a built macOS app."""

import argparse
import plistlib
import subprocess
from pathlib import Path


MOBILE = Path(__file__).resolve().parents[1]
GROUP = "$(AppIdentifierPrefix)$(PRODUCT_BUNDLE_IDENTIFIER)"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def check_source():
    for name in ("DebugProfile.entitlements", "Release.entitlements"):
        data = plistlib.loads((MOBILE / "macos/Runner" / name).read_bytes())
        require(data.get("keychain-access-groups") == [GROUP], name)
    project = subprocess.check_output(
        ["plutil", "-convert", "xml1", "-o", "-",
         str(MOBILE / "macos/Runner.xcodeproj/project.pbxproj")]
    )
    objects = plistlib.loads(project)["objects"]
    runner = next(value for value in objects.values()
                  if value.get("isa") == "PBXNativeTarget"
                  and value.get("name") == "Runner")
    configs = objects[runner["buildConfigurationList"]]["buildConfigurations"]
    for reference in configs:
        config = objects[reference]
        expected = ("Release.entitlements" if config["name"].startswith("Release")
                    else "DebugProfile.entitlements")
        require(config["buildSettings"]["CODE_SIGN_ENTITLEMENTS"] == f"Runner/{expected}", config["name"])
    print(f"Source Keychain groups verified for {len(configs)} Runner configurations")


def check_app(app):
    info = plistlib.loads((app / "Contents/Info.plist").read_bytes())
    bundle = info["CFBundleIdentifier"]
    result = subprocess.run(
        ["codesign", "-d", "--entitlements", "-", str(app)],
        check=True, capture_output=True,
    )
    entitlements = plistlib.loads(result.stdout)
    groups = entitlements.get("keychain-access-groups", [])
    require(len(groups) == 1, "Expected one app-specific Keychain group")
    group = groups[0]
    prefix = group.removesuffix("." + bundle)
    require("$" not in group and group.endswith("." + bundle) and prefix, group)
    application = entitlements.get("com.apple.application-identifier")
    require(application == f"{prefix}.{bundle}", "Keychain group must match application identifier")
    print(f"Built app Keychain access group: {group}")
    print("Entitlement inspection does not prove a provisioned Keychain write or OAuth login")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path)
    args = parser.parse_args()
    check_source()
    if args.app:
        check_app(args.app)
