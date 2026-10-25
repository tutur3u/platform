#!/usr/bin/env python3
"""Scoped Workers binding-type harness for native Start apps.

The generated binding types are global declarations: the env interface, a
`Cloudflare.GlobalProps.mainModule` that imports the Worker (and with it the
whole app graph) and ambient wildcard modules. Loading those together with
the global `@cloudflare/workers-types` runtime retypes the app's own globals
(for example `Request.json()` becomes `unknown`). This helper keeps only the
generated binding body, emits it as a module that imports the Workers types it
names from a module copy of `@cloudflare/workers-types`, and checks it against
the app's declared environment type using the app's own tsconfig, so the app
type-checks exactly as it does normally.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
EXPORTED = re.compile(
    r"^export (?:declare )?(?:abstract )?"
    r"(?:class|const|function|interface|type|enum|namespace) ([A-Za-z_][A-Za-z0-9_]*)",
    re.M,
)


def fail(message):
    print(f"native-binding-type-harness: {message}", file=sys.stderr)
    sys.exit(1)


def interface_body(source, name):
    match = re.search(r"\binterface " + re.escape(name) + r"\b[^{]*\{", source)
    if not match:
        return None
    depth, start = 1, match.end()
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start:index]
    fail(f"unterminated interface {name}")


def binding_body(generated, env_interface):
    # Current generators put the bindings in __BaseEnv_<interface>; older output
    # declares them on the interface itself.
    for name in (f"__BaseEnv_{env_interface}", env_interface):
        body = interface_body(generated, name)
        if body is not None and body.strip():
            return body
    return ""


def resolve_with_node(app):
    """Node package resolution from the app dir (hoisted or isolated installs)."""
    try:
        result = subprocess.run(
            [
                "node",
                "-e",
                "process.stdout.write(require.resolve("
                "'@cloudflare/workers-types/index.ts', { paths: [process.argv[1]] }))",
                str(app),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return None
    path = Path(result.stdout.strip()) if result.returncode == 0 else None
    return path if path and path.is_file() else None


def workers_types_module(app):
    # Frozen installs hoist the package to the repository root (or keep it in
    # Bun's isolated store behind a symlink); never assume an app-local copy.
    resolved = resolve_with_node(app)
    if resolved:
        return resolved
    for base in (app, *app.parents):
        candidate = base / "node_modules/@cloudflare/workers-types/index.ts"
        if candidate.is_file():
            return candidate
    fail("cannot resolve @cloudflare/workers-types/index.ts from " + str(app))


def build(app, generated_path, env_interface, worker_type, worker_module, out):
    for value, label in ((env_interface, "env interface"), (worker_type, "worker type")):
        if not IDENTIFIER.match(value):
            fail(f"invalid {label}: {value!r}")
    generated = generated_path.read_text()
    body = binding_body(generated, env_interface)
    module_source = workers_types_module(app)
    exported = set(EXPORTED.findall(module_source.read_text()))
    used = sorted(set(re.findall(r"\b[A-Z][A-Za-z0-9_]*\b", body)) & exported)

    out.mkdir(parents=True, exist_ok=True)
    # A .d.ts copy keeps the module form out of the checked sources.
    shutil.copyfile(module_source, out / "cloudflare-workers-types.d.ts")
    imports = (
        f"import type {{ {', '.join(used)} }} from './cloudflare-workers-types';\n"
        if used
        else "export {};\n"
    )
    (out / "native-env.module.d.ts").write_text(
        imports + f"export interface {env_interface} {{{body}}}\n"
    )
    (out / "native-env-check.ts").write_text(
        f"import type {{ {worker_type} }} from {json.dumps(str(worker_module))};\n"
        f"import type {{ {env_interface} }} from './native-env.module';\n"
        f"declare const generated: {env_interface};\n"
        f"const owned: {worker_type} = generated;\n"
        "void owned;\n"
    )
    # Extending the app config keeps its include, types and paths; `files`
    # only adds the harness, so the program is the app's own plus the check.
    # The config sits beside the app's tsconfig (and is removed after the
    # check) because type roots resolve from the config's own directory.
    config_path = app / CONFIG_NAME
    config_path.write_text(
        json.dumps(
            {
                "extends": str(app / "tsconfig.json"),
                "compilerOptions": {"noEmit": True},
                "files": [
                    str(out / "native-env.module.d.ts"),
                    str(out / "native-env-check.ts"),
                ],
            },
            indent=2,
        )
    )
    return used, config_path


CONFIG_NAME = ".native-env-check.tsconfig.json"


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--app-dir", required=True, type=Path)
    parser.add_argument("--generated", required=True, type=Path)
    parser.add_argument("--env-interface", required=True)
    parser.add_argument("--worker-type", required=True)
    parser.add_argument("--worker-module", default="cloudflare/worker")
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args(argv)
    app = args.app_dir.resolve()
    used, config_path = build(
        app,
        args.generated,
        args.env_interface,
        args.worker_type,
        app / args.worker_module,
        args.out.resolve(),
    )
    print(config_path)
    print(f"Workers types: {', '.join(used) or 'none'}", file=sys.stderr)


if __name__ == "__main__":
    main()
