"""Validate and preserve the source-declared Apps staging artifact; never deploy."""
import argparse
import hashlib
import json
import io
import os
from pathlib import Path
import re
import shutil
import tarfile
import tempfile

IDENTITY = {
    "name": "tuturuuu-apps-vite-staging",
    "compatibility_date": "2026-10-12",
    "compatibility_flags": ["nodejs_compat"],
    "workers_dev": True,
    "observability": {"enabled": True, "head_sampling_rate": 0.05},
    "vars": {"TUTURUUU_NOINDEX": "1"},
}
# Exact serialized normalizer defaults retained by the owning adapter's spread.
# No field here permits a binding; nested defaults must also remain exact.
NORMALIZED_DEFAULTS = {
    "topLevelName": "tuturuuu-apps-vite-staging", "definedEnvironments": [],
    "jsx_factory": "React.createElement", "jsx_fragment": "React.Fragment",
    "triggers": {}, "durable_objects": {"bindings": []}, "workflows": [],
    "migrations": [], "exports": {}, "kv_namespaces": [], "cloudchamber": {},
    "send_email": [], "queues": {"producers": [], "consumers": []},
    "connect": [], "r2_buckets": [], "d1_databases": [], "vectorize": [],
    "ai_search_namespaces": [], "ai_search": [], "agent_memory": [],
    "hyperdrive": [], "services": [], "analytics_engine_datasets": [],
    "dispatch_namespaces": [], "mtls_certificates": [], "pipelines": [],
    "k2": [], "secrets_store_secrets": [], "artifacts": [], "unsafe_hello_world": [],
    "flagship": [], "worker_loaders": [], "ratelimits": [], "vpc_services": [],
    "vpc_networks": [], "logfwdr": {"bindings": []},
    "python_modules": {"exclude": ["**/*.pyc"]},
    "dev": {"ip": "localhost", "local_protocol": "http", "upstream_protocol": "http", "enable_containers": True, "generate_types": False},
    "upload_source_maps": True,
    "no_bundle": True,
    "rules": [{"type": "ESModule", "globs": ["**/*.js", "**/*.mjs"]}],
}
REDIRECT = ".wrangler/deploy/config.json"
SAVED_REDIRECT = ".void/preview-deploy-config.json"
REDIRECTS = (REDIRECT, SAVED_REDIRECT)
RECEIPT = "apps-native-artifact.json"
# The exact static-asset policy besides the emitted directory; an app wrapper
# may require more (Tasks requires html_handling "none").
ASSET_POLICY = {"binding": "ASSETS", "run_worker_first": True, "not_found_handling": "none"}
PUBLIC_FILES = ("robots.txt", "sitemap.xml")
MAX_FILES = 50000
MAX_BYTES = 1024 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_json(path):
    return json.loads(Path(path).read_text())


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def member_name(name):
    require(isinstance(name, str) and name and "\\" not in name, "invalid artifact name")
    require(not any(c in name for c in "\r\n\x00"), "artifact control character")
    parts = name.split("/")
    require(not name.startswith("/") and all(p not in ("", ".", "..") for p in parts), "artifact traversal")
    require(not any(p == ".dev.vars" or p.startswith(".dev.vars.") or p == ".env" or p.startswith(".env.") for p in parts), "environment artifact forbidden")
    return name


def contained(root, path):
    root, path = Path(root).resolve(), Path(path)
    require(path.is_relative_to(root) and path != root, "path escaped artifact root")
    require(path.resolve() == path, "artifact symlink forbidden")
    return path


def emitted_path(dist, parent, value):
    require(isinstance(value, str) and value and not Path(value).is_absolute(), "emitted path must be relative")
    require("\\" not in value and not any(c in value for c in "\r\n\x00"), "invalid emitted path")
    path = Path(os.path.abspath(parent / value))
    return contained(dist, path)


def redirect_parents(app):
    for name in REDIRECTS:
        for ancestor in (app / name).parents:
            if ancestor == app:
                break
            require(not ancestor.is_symlink(), "redirect ancestor symlink forbidden")
            require(not ancestor.exists() or ancestor.is_dir(), "redirect ancestor must be a directory")


def selected_redirect(app):
    redirect_parents(app)
    # lexists counts dangling links as candidates; neither links nor duplicates win.
    candidates = [app / name for name in REDIRECTS if os.path.lexists(app / name)]
    require(len(candidates) == 1, "exactly one native/saved deploy pointer required")
    pointer = contained(app, candidates[0])
    require(pointer.is_file() and not pointer.is_symlink(), "deploy pointer must be a regular file")
    return pointer


def validate_output(directory, source=None):
    app = Path(directory).resolve()
    source = Path(source).resolve() if source else app
    dist = contained(app, app / "dist")
    require(dist.is_dir(), "missing dist")
    pointer = selected_redirect(app)
    redirect = read_json(pointer)
    require(isinstance(redirect, dict) and set(redirect) == {"configPath", "auxiliaryWorkers"}, "unexpected deploy metadata")
    require(redirect["auxiliaryWorkers"] == [] and isinstance(redirect["auxiliaryWorkers"], list), "auxiliaryWorkers must be present and empty")
    # Void saves unchanged pointer bytes; relative paths retain the native base.
    config_path = emitted_path(dist, (app / REDIRECT).parent, redirect["configPath"])
    config = read_json(config_path)
    require(isinstance(config, dict), "invalid config object")
    expected = {**IDENTITY, **NORMALIZED_DEFAULTS}
    require(set(expected) | {"configPath", "userConfigPath", "main", "assets"} <= set(config), "missing normalized output field")
    require(not (set(config) - set(expected) - {"configPath", "userConfigPath", "main", "assets"}), "unreviewed emitted config field")
    for key, value in expected.items():
        require(json.dumps(config[key], sort_keys=True) == json.dumps(value, sort_keys=True), "emitted source/normalizer contract drift: " + key)
    metadata_path = config["configPath"]
    require(isinstance(metadata_path, str) and Path(metadata_path).is_absolute() and Path(metadata_path).name == ".void-wrangler.jsonc", "unreviewed producer config metadata")
    require(config["userConfigPath"] == metadata_path, "producer config metadata drift")
    assets = config.get("assets")
    require(isinstance(assets, dict) and set(assets) == set(ASSET_POLICY) | {"directory"}, "unreviewed asset configuration")
    require(all(json.dumps(assets[key]) == json.dumps(value) for key, value in ASSET_POLICY.items()), "static bypass/fallback forbidden")
    assets_path = emitted_path(dist, config_path.parent, assets["directory"])
    require(assets_path == dist / "client" and assets_path.is_dir(), "assets must be the emitted dist/client")
    main = emitted_path(dist, config_path.parent, config.get("main"))
    require(main.is_file() and not main.is_relative_to(assets_path), "invalid emitted Worker entry")
    for name in PUBLIC_FILES:
        require((assets_path / name).is_file(), "missing public asset: " + name)
        require((assets_path / name).read_bytes() == (source / "public" / name).read_bytes(), "public asset drift: " + name)
    # A declared public file (byte-equal to the source above) may be HTML, such
    # as an offline fallback page; any other HTML is prerender output.
    html = {path.relative_to(assets_path).as_posix() for path in assets_path.rglob("*.html")}
    require(html <= set(PUBLIC_FILES), "unreviewed static HTML/prerender output")
    return {"app": app, "config": config_path, "main": main, "assets": assets_path}


def file_hashes(directory):
    app = Path(directory).resolve()
    paths = []

    def visit(path):
        require(not path.is_symlink(), "artifact symlink forbidden")
        if path.is_dir():
            for child in sorted(path.iterdir()):
                visit(child)
        else:
            require(path.is_file(), "artifact nonregular file")
            member_name(path.relative_to(app).as_posix())
            paths.append(path)

    visit(app / "dist")
    visit(selected_redirect(app))
    require(all(p.stat().st_size <= 128 * 1024 * 1024 for p in paths) and len(paths) <= MAX_FILES and sum(p.stat().st_size for p in paths) <= MAX_BYTES, "artifact exceeds bounded archive budget")
    return {p.relative_to(app).as_posix(): sha256(p.read_bytes()) for p in paths}


def artifact(directory, sha, source=None):
    require(isinstance(sha, str) and re.fullmatch(r"[a-f0-9]{40}", sha), "exact source SHA required")
    output = validate_output(directory, source)
    return {"schema": 1, "sourceSha": sha, "worker": IDENTITY["name"], "configPath": output["config"].relative_to(output["app"]).as_posix(), "files": file_hashes(directory)}


def verify(directory, receipt, sha, source=None):
    require(artifact(directory, sha, source) == receipt, "artifact differs from sealed exact-source output")


def pack(directory, receipt_path, archive_path, sha):
    receipt = read_json(receipt_path)
    verify(directory, receipt, sha)
    with tarfile.open(archive_path, "w:gz") as archive:
        for name in sorted(receipt["files"]):
            data = (Path(directory) / name).read_bytes()
            require(sha256(data) == receipt["files"][name], "output changed during packing")
            info = tarfile.TarInfo(name)
            info.size = len(data)
            archive.addfile(info, io.BytesIO(data))
        data = (json.dumps(receipt, indent=2) + "\n").encode()
        info = tarfile.TarInfo(RECEIPT)
        info.size = len(data)
        archive.addfile(info, io.BytesIO(data))
    verify(directory, receipt, sha)


def restore(directory, archive_path, receipt_path, sha):
    app = Path(directory).resolve()
    require(app.is_dir() and not (app / "dist").exists() and not (app / "dist").is_symlink() and not any(os.path.lexists(app / name) for name in REDIRECTS), "restore requires a fresh output tree")
    redirect_parents(app)
    with tempfile.TemporaryDirectory(prefix="apps-artifact-") as temporary:
        stage = Path(temporary).resolve()
        with tarfile.open(archive_path, "r:gz") as archive:
            members, total = [], 0
            for member in archive:
                total += member.size
                require(len(members) < MAX_FILES + 1 and total <= MAX_BYTES and member.size <= 128 * 1024 * 1024, "archive budget exceeded")
                members.append(member)
            names = [member_name(m.name) for m in members]
            require(len(set(names)) == len(names) and all(m.isfile() for m in members), "duplicate/nonregular archive member")
            require(names.count(RECEIPT) == 1, "missing archive receipt")
            receipt_member = members[names.index(RECEIPT)]
            require(receipt_member.size <= 16 * 1024 * 1024, "receipt exceeds budget")
            receipt = json.loads(archive.extractfile(receipt_member).read())
            require(isinstance(receipt, dict) and receipt.get("sourceSha") == sha and isinstance(receipt.get("files"), dict), "wrong source receipt")
            require(set(names) == set(receipt["files"]) | {RECEIPT}, "unexpected/missing archive member")
            for member in members:
                name = member.name
                if name == RECEIPT:
                    continue
                require(name.startswith("dist/") or name in REDIRECTS, "archive may only restore owned output")
                payload = archive.extractfile(member).read()
                require(sha256(payload) == receipt["files"][name], "archive member hash mismatch")
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(payload)
        verify(stage, receipt, sha, app)
        pointer = selected_redirect(stage).relative_to(stage)
        redirect_parents(app)
        require(not any(os.path.lexists(app / name) for name in REDIRECTS), "restore pointer appeared")
        # Restore only dist and the exact sealed native/saved pointer bytes.
        shutil.move(str(stage / "dist"), app / "dist")
        target = app / pointer
        redirect_parents(app)
        require(not any(os.path.lexists(app / name) for name in REDIRECTS), "restore pointer appeared")
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(stage / pointer), target)
        verify(app, receipt, sha)
        Path(receipt_path).write_text(json.dumps(receipt, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=["config", "seal", "verify", "pack", "restore"])
    parser.add_argument("directory", type=Path)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    sha = os.environ.get("APPS_SOURCE_SHA")
    if args.mode == "config":
        output = validate_output(args.directory)
        require(os.environ.get("GITHUB_OUTPUT"), "config discovery requires the CI output channel")
        with open(os.environ["GITHUB_OUTPUT"], "a") as channel:
            channel.write("config=" + str(output["config"]) + "\n")
    elif args.mode == "seal":
        args.receipt.write_text(json.dumps(artifact(args.directory, sha), indent=2) + "\n")
    elif args.mode == "verify":
        verify(args.directory, read_json(args.receipt), sha)
    elif args.mode == "pack":
        pack(args.directory, args.receipt, args.archive, sha)
    else:
        restore(args.directory, args.archive, args.receipt, sha)


if __name__ == "__main__":
    main()
