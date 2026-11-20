"""Validate and seal the route-free LMS artifact without publishing it."""

import importlib.util
import os
from pathlib import Path

path = Path(__file__).with_name("apps-native-artifact.py")
spec = importlib.util.spec_from_file_location("lms_native_artifact_base", path)
artifact = importlib.util.module_from_spec(spec)
spec.loader.exec_module(artifact)
artifact.IDENTITY = {
    **artifact.IDENTITY,
    "name": "tuturuuu-lms",
    "workers_dev": False,
}
artifact.NORMALIZED_DEFAULTS = {
    **artifact.NORMALIZED_DEFAULTS,
    "topLevelName": "tuturuuu-lms",
    "preview_urls": False,
    "services": [
        {"binding": "TEACH", "service": "tuturuuu-teach"},
        {"binding": "LEARN", "service": "tuturuuu-learn"},
    ],
}
artifact.PUBLIC_FILES = ()
artifact.RECEIPT = "lms-native-artifact.json"

if __name__ == "__main__":
    if "LMS_SOURCE_SHA" in os.environ:
        os.environ["APPS_SOURCE_SHA"] = os.environ["LMS_SOURCE_SHA"]
    else:
        os.environ.pop("APPS_SOURCE_SHA", None)
    artifact.main()
