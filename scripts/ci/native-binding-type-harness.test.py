#!/usr/bin/env python3
"""Regressions for the scoped Workers binding-type harness."""

import importlib.util
import json
import shutil
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "harness", HERE / "native-binding-type-harness.py"
)
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)

GENERATED = """/* eslint-disable */
interface __BaseEnv_FinanceGeneratedEnv {
\tASSETS: Fetcher;
\tCACHE: KVNamespace;
\tTUTURUUU_NOINDEX: "1";
\tNESTED: { inner: { value: string } };
}
declare namespace Cloudflare {
\tinterface GlobalProps {
\t\tmainModule: typeof import("../apps/finance/cloudflare/worker");
\t}
\tinterface Env extends __BaseEnv_FinanceGeneratedEnv {}
}
interface FinanceGeneratedEnv extends __BaseEnv_FinanceGeneratedEnv {}
declare module "*.txt" {
\tconst value: string;
\texport default value;
}
"""

WORKERS = """export declare abstract class Fetcher {}
export interface KVNamespace<Key extends string = string> {}
export declare const console: Console;
export type Unused = string;
"""


class HarnessTest(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.app = self.root / "apps/finance"
        types = self.root / "node_modules/@cloudflare/workers-types"
        types.mkdir(parents=True)
        (types / "package.json").write_text('{"name":"@cloudflare/workers-types"}')
        (types / "index.ts").write_text(WORKERS)
        self.app.mkdir(parents=True)
        (self.app / "tsconfig.json").write_text("{}")
        self.generated = self.root / "env.d.ts"
        self.generated.write_text(GENERATED)
        self.out = self.root / "out"

    def run_build(self, **overrides):
        options = dict(
            app=self.app,
            generated_path=self.generated,
            env_interface="FinanceGeneratedEnv",
            worker_type="FinanceEnvironment",
            worker_module=self.app / "cloudflare/worker",
            out=self.out,
        )
        options.update(overrides)
        return harness.build(**options)

    def test_emits_only_the_binding_body_as_a_module(self):
        used, _ = self.run_build()
        self.assertEqual(used, ["Fetcher", "KVNamespace"])
        module = (self.out / "native-env.module.d.ts").read_text()
        self.assertTrue(
            module.startswith(
                "import type { Fetcher, KVNamespace } from './cloudflare-workers-types';\n"
            )
        )
        self.assertIn("export interface FinanceGeneratedEnv {", module)
        self.assertIn("NESTED: { inner: { value: string } };", module)
        # Nothing global and no Worker graph import leaks from the generated file.
        for leaked in ("mainModule", "declare namespace", "declare module", "__BaseEnv_"):
            self.assertNotIn(leaked, module)
        self.assertTrue((self.out / "cloudflare-workers-types.d.ts").is_file())

    def test_checks_against_the_app_config_without_overriding_it(self):
        _, config_path = self.run_build()
        # Beside the app tsconfig so type roots resolve exactly as for the app.
        self.assertEqual(config_path.parent, self.app)
        config = json.loads(config_path.read_text())
        self.assertEqual(config["extends"], str(self.app / "tsconfig.json"))
        self.assertEqual(config["compilerOptions"], {"noEmit": True})
        self.assertNotIn("include", config)
        self.assertNotIn("types", config["compilerOptions"])
        check = (self.out / "native-env-check.ts").read_text()
        self.assertIn("const owned: FinanceEnvironment = generated;", check)
        self.assertNotIn("reference", check)

    def test_reads_bindings_declared_on_the_interface_itself(self):
        self.generated.write_text("interface FinanceGeneratedEnv {\n\tASSETS: Fetcher;\n}\n")
        self.assertEqual(self.run_build()[0], ["Fetcher"])

    def module_source(self):
        return (self.out / "cloudflare-workers-types.d.ts").read_text()

    def test_resolves_a_hoisted_install_without_an_app_local_copy(self):
        # setUp installs the package only at the repository root.
        self.assertFalse((self.app / "node_modules").exists())
        self.run_build()
        self.assertEqual(self.module_source(), WORKERS)

    def test_resolves_bun_isolated_store_through_the_root_symlink(self):
        root_link = self.root / "node_modules/@cloudflare/workers-types"
        shutil.rmtree(root_link)
        store = (
            self.root
            / "node_modules/.bun/@cloudflare+workers-types@5.0.0/node_modules/@cloudflare/workers-types"
        )
        store.mkdir(parents=True)
        (store / "package.json").write_text('{"name":"@cloudflare/workers-types"}')
        (store / "index.ts").write_text(WORKERS.replace("Unused", "Isolated"))
        root_link.symlink_to(store, target_is_directory=True)
        self.run_build()
        self.assertIn("Isolated", self.module_source())

    def test_prefers_an_app_local_install_when_present(self):
        local = self.app / "node_modules/@cloudflare/workers-types"
        local.mkdir(parents=True)
        (local / "package.json").write_text('{"name":"@cloudflare/workers-types"}')
        (local / "index.ts").write_text(WORKERS.replace("Unused", "Local"))
        self.run_build()
        self.assertIn("Local", self.module_source())

    def test_fails_when_the_package_cannot_be_resolved(self):
        shutil.rmtree(self.root / "node_modules")
        with self.assertRaises(SystemExit):
            self.run_build()

    def test_rejects_unsafe_type_names(self):
        with self.assertRaises(SystemExit):
            self.run_build(worker_type="Env; import('x')")


if __name__ == "__main__":
    unittest.main()
