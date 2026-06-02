# Web Release Checklist

Use this checklist for `apps/web` version badge and release metadata work.

## Version Bump

- Bump `TUTURUUU_PLATFORM_VERSION` in `packages/utils/src/platform-release.ts`
  once per authored platform commit.
- Update `packages/utils/src/platform-release.test.ts` with the new expected
  version.
- Keep the `x-release-please-version` annotations on both platform version
  lines. Release Please updates those annotated lines and the root
  `platform-version.txt` file when it opens the `platform` release PR.
- Do not edit package manifests for the displayed badge version unless the user
  asks for package metadata changes.

## Badge Contract

- Keep `VersionBadgeGate` account-gated by exact Tuturuuu email and keep the
  user config opt-in.
- Keep `VersionBadge` props source-compatible.
- If new `version-badge` translation keys are added in `packages/ui`, update
  every app message bundle that ships the shared UI and run `bun i18n:sort`.

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
- Convert millisecond timestamps to ISO strings for `builtAt`.
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
