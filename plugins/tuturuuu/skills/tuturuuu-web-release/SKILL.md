---
name: tuturuuu-web-release
description: Apps/web release metadata and version-badge guidance for Tuturuuu platform work, including release-please-managed TUTURUUU_PLATFORM_VERSION metadata, blue/green runtime snapshot fallbacks, PLATFORM_BUILD metadata, and focused release verification.
---

# Tuturuuu Web Release

Use this skill when touching the `apps/web` version badge, platform release
metadata, Docker blue/green deployment metadata, release docs, or release-please
version metadata.

## Core Rules

- Treat `TUTURUUU_PLATFORM_VERSION` in `@tuturuuu/utils/platform-release` as
  the displayed platform badge version. Do not manually bump it for ordinary
  authored commits; Release Please updates it from `platform-version.txt`.
- Keep the `x-release-please-version` comments on the platform version constant
  and matching test expectation. The monorepo release-please config also keeps
  `platform-version.txt` aligned for the `platform` release component.
- Do not bump `apps/web/package.json` for badge/version display unless the user
  explicitly asks for package metadata changes.
- Preserve the account gate: only exact `@tuturuuu.com` users can see/manage the
  badge, and the user setting remains opt-in.
- Preserve the bottom-right compact badge and hover/focus details unless the
  user explicitly asks for a visual redesign.
- Read only lightweight blue/green runtime files for self-hosted inference:
  `prod/target-state.json`, `prod/active-color`, `prod/deployment-stamp`,
  `watch/blue-green-auto-deploy.status.json`, and
  `watch/blue-green-auto-deploy.history.json`.

## Metadata Precedence

For `apps/web`, keep metadata precedence stable:

1. Explicit `PLATFORM_BUILD_*` runtime environment values.
2. Mounted blue/green runtime snapshot via `PLATFORM_BLUE_GREEN_MONITORING_DIR`,
   with local `tmp/docker-web` fallbacks for development.
3. Generated Vercel/GitHub build metadata.
4. Existing local defaults.

Do not invent deployment URL, ref, or environment from active color, commit
hash, or deployment stamp alone. Use those fields only when an explicit env,
runtime row, status snapshot, or generated metadata provides them.

`builtAt` means the checked-out source commit timestamp. Do not populate it
from deployment start, finish, activation, promotion, or wall-clock time. Keep
those deployment timestamps in GitHub/Vercel records and blue/green history.

## Implementation Checklist

Read `references/web-release-checklist.md` when implementing or reviewing
release metadata changes. It lists the expected files, fallback selection order,
and focused verification commands.
