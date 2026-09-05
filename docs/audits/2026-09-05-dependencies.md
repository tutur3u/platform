# Dependency upgrade — 2026-09-05

Updated JavaScript workspaces with `bun update --latest --recursive`, Rust with
`cargo update` plus the direct `base64` 0.23.1 upgrade, Python with `uv lock --upgrade`,
and Flutter with `flutter pub upgrade --major-versions`.

Bun is pinned to 1.4.1 in package-manager metadata, CI setup, development containers,
production Dockerfiles, validators, and operational examples. The installed Bun
binary was already 1.4.1. Vitest 5 and Vite 8.2.2 were already present in the baseline.

Compatibility changes align Biome schemas and CI commands with 2.5.12, order three
CSS rules to satisfy the newer specificity check without changing declarations,
and adapt mobile async returns to very_good_analysis 11. The mobile gate also applies
its required Dart formatter. Both CocoaPods installs succeeded without lockfile drift.

## Version constraints

The one-day npm release-age policy and its existing exact-package exemptions remain
in force. `bun outdated --recursive` reports only releases held by that policy.
Root npm overrides match the registry's latest tags. All direct Flutter packages are
at their latest resolvable versions; newer analyzer, testing, keyboard-visibility,
QR, and other transitive packages remain constrained by upstream packages or Flutter.
The vendored flutter_pcm_sound 3.3.3 matches its latest published version.
Rust matchit remains constrained by axum.

## Known verification limits

- Playground fails to prerender `/` because its next-intl configuration is missing.
  The same build failure reproduces in unchanged main at 67d0c59520b8.
- External fails to prerender `/supabase` without local Supabase configuration;
  the same missing-URL failure reproduces on unchanged main.
- `bun audit` reports 15 advisories across pinned transitive OpenTelemetry, esbuild,
  lodash-es, nanoid, uuid, and speaker. `bun audit fix --dry-run` proposes no compatible
  fixes: upstream dependency ranges block updates, and speaker has no published fix.
  No blanket overrides, advisory ignores, or release-age bypasses were added.

## Validation

- Frozen Bun install passed.
- Python Ruff and MyPy passed; pytest: 72 passed.
- Mobile format, analysis, project settings, and 522 tests passed.
- Full `bun check --run-all`: all 21 reported gates passed. An infrastructure test
  timeout under concurrent builds passed in isolation, as a full suite, and in the
  final full check without source changes.
- Rust format, strict Clippy, 3,114 tests, and Worker-target check passed; final
  strict Clippy also passed against the direct base64 upgrade.
- Application/package build run: 35 tasks succeeded; External failed for the
  baseline configuration reason above. Playground was checked separately on both
  upgraded and unchanged source and failed for its baseline localization setup.
- Changed JSON parsing, source-size checks, and scoped whitespace checks passed.
