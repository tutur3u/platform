# CI And Tooling Patterns

Load this reference when changing root scripts, CI workflows, plugin validation,
formatting behavior, or repo-wide verification.

## Commands And Formatting

- Do not run long-lived dev/build commands such as `bun dev`, `bun run build`,
  or equivalent bundling unless the user explicitly asks.
- For TypeScript, JavaScript, root scripts, or repo config changes, finish with
  `bun check` unless a documented unrelated blocker prevents it.
- Use focused package-local tests first, then repo checks.
- For single-package validation, prefer package-local commands such as
  `bun --cwd packages/ai vitest run ...` instead of root commands that fan out
  through Turbo.
- Run `bun ff` for touched frontend/TS files when required, but do not format
  unrelated dirty files.
- If `bun ff -- <files>` still triggers repo-wide Biome behavior, treat
  `bun check` as the authoritative final signal and keep any manual fixes
  scoped to owned files.

## Root Scripts

- Root script tests belong in `node --test scripts/*.test.js` and should be
  wired into `scripts/check.js` when a new utility needs CI coverage.
- ANSI strip helpers in root scripts should use `new RegExp(...)` forms when
  Biome would otherwise flag control characters in regex literals.
- Literal `${...}` source checks should use regex or escaped forms, not plain
  string literals that trip `noTemplateCurlyInString`.
- Do not remove caching, fail-fast behavior, or security validation silently;
  document the rationale when tooling behavior changes.

## CI And Dependency Drift

- Keep workflow Bun versions aligned with the repo `packageManager` pin.
- Release Please is the monorepo source of truth for version/changelog PRs.
  Keep `release-please-config.json`, `.release-please-manifest.json`,
  `.github/workflows/release-please.yaml`, and `tuturuuu.ts` aligned when
  changing release automation. Do not reintroduce checksum or PR-title package
  version bump generators.
- Package release workflows are npm-only for now. Do not add JSR or GitHub
  Packages publish jobs, and do not wire `jsr.json` version files into Release
  Please while those registries are paused.
- If local type-check passes but CI fails from stale incremental state, rerun
  with forced cache invalidation before changing unrelated code.
- Do not patch unrelated packages just because `bun check` fails outside the
  owned scope. Run focused verification and report the blocker.
- Package subpath imports must be covered by the package `exports`; do not
  assume a directory `index.ts` is importable through a bare subpath.

## Plugin Changes

- Bump `plugins/tuturuuu/.codex-plugin/plugin.json` when skills materially
  change.
- Keep skill folders aligned with frontmatter names and include
  `agents/openai.yaml`.
- Keep default prompts short, natural, and action-oriented.
- Run `python3 plugins/tuturuuu/scripts/validate_plugin.py` after plugin edits.
