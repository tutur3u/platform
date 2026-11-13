# Rewise tooling gap admissions

Source head: `be5bb896bf9db3e244fd2086bbf604491e6d4aa9`.
The five admitted source files are unchanged by this admission record.
Decision: https://github.com/tutur3u/platform/pull/7899.

Each digest uses the existing scanner's trimmed mention-line SHA-256 algorithm.
Counts include every case-insensitive token and comment. Reused gap definitions
are identical to the guard's source definitions. The guard owner binds these
entries after exact-head Security acceptance; this record changes no guard and
asserts no runtime, configuration publication, provider or release acceptance.

```json
{
  "gaps": {
    "shared-toolchain": {
      "reason": "Root wrangler devDependency supplies the CLI for every remaining gap; trustedDependencies, .wrangler ignores and policy tests cover @cloudflare/vite-plugin 1.x, which depends on the wrangler library.",
      "owner": "cf/Void Wrangler-exit lane",
      "removal": "Delete when no other allowlist entry needs the Wrangler CLI and @cloudflare/vite-plugin 2.x (no wrangler dependency) is adopted."
    },
    "void-emitted-runtime": {
      "reason": "Void emits dist/server/wrangler.json rather than cf Build Output. The qualified cf/Vite runtime harness accepts cloudflare.config.ts or .cloudflare/output/v0 and has no equivalent sealed Void-config runner with injected bindings, outboundService interception and fail-closed provider auth. Retain the isolated unstable_startWorker fixture and its pinned dependency; no publication is admitted.",
      "owner": "Mastermind native Start qualification owner and cf/Void Wrangler-exit lane",
      "removal": "Remove when the cf/Void runtime harness accepts the exact sealed Void artifact and preserves disposable secrets, outbound interception, denied provider auth, no rebuild, no publication and all owner/host/session assertions."
    },
    "void-wave1-publication": {
      "reason": "Void deploy always rebuilds and provisions (--skip-build is static-only in Void 1.1.12 and 1.2.1), so Wave 1 Start + Void apps publish the exact Void-emitted config with Wrangler.",
      "owner": "Wave 1 native Start + Void lane",
      "removal": "Delete when Void builds emit a cf Build Output (or Void ships a prebuilt Worker deploy) and cf deploy --prebuilt publication is proven byte-identical."
    }
  },
  "files": {
    ".github/workflows/rewise-cloudflare.yaml": {
      "lines": 3,
      "uses": 3,
      "gap": "void-wave1-publication",
      "admitted": {
        "decision": "https://github.com/tutur3u/platform/pull/7899",
        "reason": "Three data-only mentions: two build/seal labels and WRANGLER_SEND_METRICS=false. The workflow builds and seals the exact source with public inputs, never invokes the CLI and has no provider deployment step or provider credential. Void profiles keep workers_dev and preview_urls false, no routes, ASSETS as the only resource binding, and TUTURUUU_NOINDEX as the sole non-secret var; the artifact validator rejects other bindings and settings. This admits these mentions only; publication and runtime acceptance remain separately gated."
      },
      "digest": "3ec6b8fe2cf9ec9fa028460545a704efe37c68c6f8baec416d205c41a1d67ae6",
      "kind": "workflow"
    },
    "apps/rewise/.gitignore": {
      "lines": 1,
      "uses": 1,
      "gap": "shared-toolchain",
      "admitted": {
        "decision": "https://github.com/tutur3u/platform/pull/7899",
        "reason": "The .void-wrangler.jsonc line ignores a local Void-emitted scratch configuration. It executes nothing, loads no environment or credential and creates no route or binding. Keep this ignore while Void emits the legacy-named scratch file; remove it only with the producer so generated configuration is not accidentally staged."
      },
      "digest": "eaa5c36b89bb2cc16b4b93bbe4ccfdddcddacc00b12726e591d57c46be30f9e8",
      "kind": "source"
    },
    "apps/rewise/cloudflare/anonymous-smoke.runtime.mjs": {
      "lines": 1,
      "uses": 1,
      "gap": "void-emitted-runtime",
      "admitted": {
        "decision": "https://github.com/tutur3u/platform/pull/7899",
        "reason": "The pinned SDK starts a disposable local workerd from the sealed Void-emitted config, with bundling and entrypoint processing disabled. Config assertions require routes=[], workers_dev=false and preview_urls=false; injected values are synthetic fixture bindings. Empty explicit envFiles, isolated registry, remote=false, persist=false, denied provider auth, intercepted outbound requests, disabled metrics, 120-second tests and disposal prevent provider publication, credential-backed ingress or external egress. Retain until the cf/Void runner accepts the same sealed artifact with equivalent isolation and negative controls."
      },
      "digest": "e139bd3b3961b60527b5aa98419fb40cde9679450f4c651769242014bfec1e29",
      "kind": "source"
    },
    "apps/rewise/cloudflare/native-built-worker.runtime.mjs": {
      "lines": 1,
      "uses": 1,
      "gap": "void-emitted-runtime",
      "admitted": {
        "decision": "https://github.com/tutur3u/platform/pull/7899",
        "reason": "The SDK runs a disposable copy of the CI-sealed staging artifact with an empty explicit env file and an isolated registry. The fixture disables bundling, entrypoint processing, remote access, persistence and metrics; provider auth throws and all outbound requests are intercepted and denied. It checks the staging Worker identity and settings against the app config, with synthetic bindings, a 120-second timeout and disposal. This admits the local SDK import only, not the held redirect expectation, a runtime pass or publication. Remove when the cf/Void runner preserves the same sealed-artifact and isolation contract."
      },
      "digest": "48ca5c86212153d8453634f1858ce3959303f9191bbf8c6c7da6cc0663c4fc20",
      "kind": "source"
    },
    "apps/rewise/package.json": {
      "lines": 1,
      "uses": 1,
      "gap": "void-emitted-runtime",
      "admitted": {
        "decision": "https://github.com/tutur3u/platform/pull/7899",
        "reason": "The exact devDependency pin supplies SDK 4.151.2 for the two isolated sealed-Void runtime fixtures. The admission does not add a CLI command, lifecycle script, remote provider action, binding, route or secret. Existing deployment authority is unchanged. Remove the dependency when an equivalent cf/Void sealed-artifact runner replaces these SDK callers; dependency changes require fresh byte-bound admission."
      },
      "digest": "1f6fc0c17236885fd25a391298f3d3c48d869ec8d057a0c47692394f921ace4b",
      "kind": "manifest"
    }
  }
}
```
