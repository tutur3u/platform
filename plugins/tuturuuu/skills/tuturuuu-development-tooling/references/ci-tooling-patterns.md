# CI And Tooling Patterns

Load this reference when changing root scripts, CI workflows, plugin validation,
formatting behavior, or repo-wide verification.

## Incremental Oxc and Worker adoption

Use root-pinned Oxlint/Oxfmt through `bun oxc:lint`, `bun oxc:format` and
`bun oxc:write` with explicit owned-file paths. Read-only commands are the default;
format writes are intentional. Existing Biome CI/editor/generator ownership remains
until a workspace records rule coverage, formatting deltas and compensating
validators. Do not run global formatters or the root-wide Vite+ migrator for a
single workspace. Run `node --test scripts/oxc.test.js` to exercise file scope,
symlink rejection, dialog linting and read-only formatting behavior.

Gradual Cloudflare adoption preserves request/session, API, storage, consent and
localization contracts. Domain modules and portable React components use injected
adapters rather than framework/runtime globals. Keep framework imports in explicit
adapter entrypoints and protect portability with import-boundary regressions.
Vite+ tooling does not convert Next.js routes/actions; paused TanStack Start remains
paused. See [adoption guidance](../../../../../apps/docs/build/development-tools/oxc-cloudflare-adoption.mdx)
for parity and Worker acceptance gates; builds stay in exact-commit CI.

## cf CLI migration boundaries

Target: cf + Void (Vite+), adopted per verified operation while retaining existing
commands until parity. Wrangler gaps remain in the shrink-only
`scripts/ci/wrangler-usage-allowlist.json`, enforced by
`scripts/ci/wrangler-usage-guard.test.js`. Lower or delete an entry in the change
that removes usage. Count executable occurrences separately from mention lines,
including multiple invocations per line. Changed Wrangler-line hashes, growth and
changed gap scope need a fresh structured `admitted` PR decision and reason. Native Workers
use `cloudflare.config.ts` + `@cloudflare/vite-plugin` `newConfig.cfBuildOutput`,
Build Output identity parity (`scripts/ci/cf-worker-parity.mjs`), runtime checks via
`scripts/ci/cf-vite-worker.mjs`, and `cf deploy --prebuilt --no-provision`
(`--provision` defaults to true). See the
[parity matrix](../../../../../apps/docs/build/development-tools/cf-cli-wrangler-parity.mdx)
for per-operation verdicts, rollback and the cutover checklist. Run
`node --test scripts/ci/cf-vite-worker.test.mjs` for disposable-secret refusal
and environment-restoration regressions without starting a real Worker. Require
fixtures for all declared secrets, mask declared text bindings from the shell and
retain only the first prior environment value. Deploy settings snapshots must
pass before publication and after it; DO publication remains Wrangler until a
separately reviewed rehearsal receipt permits cf.

Settings preflight tokens need Workers Scripts read coverage on the pinned account,
plus Zone and Workers Routes read coverage on every target-account zone; narrower
visibility can hide unexpected routes. Keep the bounded fail-closed checks and see
the parity runbook's permission table. The usage inventory scans tracked executable
files in `tmp/` but excludes `.md`/`.mdx`/`.txt` everywhere, including runnable docs.

Include `.cloudflare/output/**` in Turbo build outputs. Validate a real cache-hit
replay after deleting emitted files; replayed logs alone do not qualify an artifact.
Keep `.cloudflare/state` outside cache outputs. cf prerelease pins remain held by
Renovate until an owner qualifies a scoped upgrade. Production jobs require the
Actions repository variable `CLOUDFLARE_ACCOUNT_ID` to match emitted account identity.
