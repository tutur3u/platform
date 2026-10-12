"""Verify a finite pip resolution against PyPI and emit an exact wheel lock."""
import argparse
import hashlib
import json
import os
import re
import urllib.request
from pathlib import Path


def metadata(name, version):
    url = f"https://pypi.org/pypi/{name}/{version}/json"
    with urllib.request.urlopen(url, timeout=15) as response:
        body = response.read(2 * 1024 * 1024 + 1)
    if len(body) > 2 * 1024 * 1024:
        raise ValueError("PyPI metadata exceeds bound")
    return json.loads(body), url


def embed_resources(output):
    source = Path(__file__).parent
    adapter = (source / "python-adapter.py").read_bytes()
    generated = "// Generated from python-adapter.py by prepare-python-runtime.py.\n"
    generated += "// biome-ignore-all format: deterministic generated resources\n"
    generated += "export const PYTHON_ADAPTER_CODE = " + json.dumps(adapter.decode()) + ";\n"
    generated += "export const PYTHON_ADAPTER_HASH = " + json.dumps(hashlib.sha256(adapter).hexdigest()) + ";\n"
    for constant, filename in [("PYTHON_RUNTIME_MANIFEST", "python-runtime-manifest.json"),
                               ("PYTHON_INSTALLATION_MANIFEST", "python-installation-manifest.json")]:
        content = (source / filename).read_bytes()
        generated += "export const " + constant + " = " + json.dumps(json.loads(content), separators=(",", ":")) + ";\n"
        generated += "export const " + constant + "_HASH = " + json.dumps(hashlib.sha256(content).hexdigest()) + ";\n"
    output_path = Path(output)
    if output_path.exists() and not output_path.read_text().startswith("// Generated from python-adapter.py by prepare-python-runtime.py.\n"):
        raise ValueError("refusing to replace an unrelated adapter file")
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as target:
        target.write(generated)
        target.flush()
        os.fsync(target.fileno())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--report")
    parser.add_argument("--manifest")
    parser.add_argument("--requirements")
    parser.add_argument("--embed-adapter")
    parser.add_argument("--embed-only", action="store_true")
    args = parser.parse_args()
    if args.embed_only:
        if not args.embed_adapter or any([args.report, args.manifest, args.requirements]):
            parser.error("--embed-only requires only --embed-adapter")
        embed_resources(args.embed_adapter)
        print(json.dumps({"embedded": True, "offline": True, "modelDownloaded": False}))
        return
    if not all([args.report, args.manifest, args.requirements]):
        parser.error("wheel verification requires --report, --manifest and --requirements")
    report = json.loads(Path(args.report).read_text())
    records = report["install"]
    if not 1 <= len(records) <= 20:
        raise ValueError("runtime resolution exceeds package bound")
    wheels = []
    total = 0
    for record in records:
        name = record["metadata"]["name"]
        version = record["metadata"]["version"]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name + version):
            raise ValueError("invalid package identity")
        distribution, evidence = metadata(name, version)
        selected = record["download_info"]
        candidates = [file for file in distribution["urls"] if file["url"] == selected["url"]]
        if len(candidates) != 1:
            raise ValueError("wheel URL differs from primary metadata")
        file = candidates[0]
        sha = file["digests"]["sha256"]
        if file["yanked"] or file["packagetype"] != "bdist_wheel" or not re.fullmatch(r"[0-9a-f]{64}", sha):
            raise ValueError("wheel is unavailable, yanked or lacks a digest")
        if sha != selected["archive_info"]["hashes"]["sha256"]:
            raise ValueError("resolver and publisher wheel hashes disagree")
        license_name = distribution["info"].get("license_expression") or distribution["info"].get("license")
        license_evidence = evidence
        if not license_name:
            primary_licenses = {
                ("prompt_toolkit", "3.0.53"): ("BSD-3-Clause", "https://raw.githubusercontent.com/prompt-toolkit/python-prompt-toolkit/3.0.53/LICENSE", "Neither the name"),
                ("wcwidth", "0.9.2"): ("MIT", "https://raw.githubusercontent.com/jquast/wcwidth/0.9.2/LICENSE", "The MIT License"),
            }
            entry = primary_licenses.get((name.replace("-", "_"), version))
            if entry is None:
                raise ValueError(f"missing license metadata for {name}")
            license_name, license_evidence, required_text = entry
            with urllib.request.urlopen(license_evidence, timeout=15) as response:
                license_body = response.read(16384).decode()
            if required_text not in license_body:
                raise ValueError("primary license differs from expected license")
        total += file["size"]
        if total > 64 * 1024 * 1024:
            raise ValueError("runtime wheel bytes exceed 64 MiB")
        wheels.append({"name": name, "version": version, "filename": file["filename"],
                       "sha256": sha, "bytes": file["size"], "url": file["url"],
                       "license": license_name, "licenseEvidence": license_evidence, "evidence": evidence})
    manifest = {"version": 1, "runtime": "litert-lm", "runtimeVersion": "0.18.0",
                "environment": report["environment"], "wheelBytes": total,
                "source": "https://github.com/google-ai-edge/LiteRT-LM/releases/tag/v0.18.0",
                "wheels": wheels, "modelDownloaded": False, "apiProbePerformed": False}
    requirements = "\n".join(f'{wheel["name"]}=={wheel["version"]} --hash=sha256:{wheel["sha256"]}' for wheel in wheels) + "\n"
    for path, content in [(args.manifest, json.dumps(manifest, indent=2) + "\n"), (args.requirements, requirements)]:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
    if args.embed_adapter:
        embed_resources(args.embed_adapter)
    print(json.dumps({"verifiedWheels": len(wheels), "bytes": total, "installed": False, "modelDownloaded": False}))


if __name__ == "__main__":
    main()
