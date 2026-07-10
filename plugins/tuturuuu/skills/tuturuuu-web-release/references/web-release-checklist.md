# Web Release Checklist

Use this checklist for `apps/web` version badge and release metadata work.

## Release Version

- Do not manually bump `TUTURUUU_PLATFORM_VERSION` for ordinary authored
  commits. Release Please updates `platform-version.txt`,
  `packages/utils/src/platform-release.ts`, and
  `packages/utils/src/platform-release.test.ts` together.
- Keep the `x-release-please-version` annotations on both platform version
  lines. Release Please updates those annotated lines and the root
  `platform-version.txt` file when it opens the `platform` release PR.
- Use `bun git-release-please` from a clean `main` checkout when merging a
  generated release-please branch. If already resolving a manual release-please
  merge, run `bun release:sync-platform-version`.
- Do not edit package manifests for the displayed badge version unless the user
  asks for package metadata changes.

## Badge Contract

- Keep `VersionBadgeGate` account-gated by exact Tuturuuu email and keep the
  user config opt-in.
- Keep `VersionBadge` props source-compatible.
- If new `version-badge` translation keys are added in `packages/ui`, update
  every app message bundle that ships the shared UI with `bun i18n:add --all`
  or bulk `bun i18n:add --all --mode add --entries ...`, then run
  `bun i18n:sort`.

## Runtime Metadata

- Use explicit `PLATFORM_BUILD_*` runtime env first.
- Fill missing values from the mounted blue/green snapshot under
  `PLATFORM_BLUE_GREEN_MONITORING_DIR`.
- Local development fallbacks may search `tmp/docker-web` relative to the app
  and repo root.
- Read only these runtime files:
  - `prod/target-state.json`
  - `prod/active-color`
  - `prod/deployment-stamp`
  - `watch/blue-green-auto-deploy.status.json`
  - `watch/blue-green-auto-deploy.history.json`
- Select runtime deployment data in this order:
  - `targets.web` for the active color
  - active deployment row
  - latest successful row matching active color
  - latest successful row
- Map `commitSubject` to `commitMessage`.
- Populate `builtAt` only from explicit source metadata or the checked-out
  commit's `committedAt` timestamp. Deployment activation, start, finish,
  promotion, and update timestamps may order runtime candidates, but must not be
  relabeled as source time.
- Use the runtime deployment stamp file as the authoritative snapshot stamp
  when explicit env does not provide one.
- Do not infer deployment URL, ref, or environment from active color or commit
  fields alone.

## Focused Verification

Run the checks that match the touched files:

```bash
bun --cwd apps/web test -- src/lib/platform-release-runtime.test.ts
bun --cwd packages/ui test src/components/ui/custom/version-badge.test.tsx
bun --cwd packages/utils test src/platform-release.test.ts
node --test scripts/watch-blue-green-deploy.test.js
node --test scripts/docker-web.test.js
python3 plugins/tuturuuu/scripts/validate_plugin.py
bun check
```
