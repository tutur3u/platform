# Mobile Flutter/Dart Rules

Root `AGENTS.md` applies. Use `uv` only for Python; mobile uses the checked-in
Flutter/Dart toolchain and app package configuration.

- Run `flutter gen-l10n` after ARB changes; format Dart sources, not ARB files.
- Run `bun check:mobile` for Dart, ARB, dependency, or native configuration changes.
  Analysis info-level diagnostics fail CI. Documentation-only edits need no Flutter suite.
- Preserve user/workspace isolation in caches and permission checks. Pass request
  context through mobile Bearer-auth APIs; cookie-only helpers are insufficient.
- Release Please owns release versions. Keep iOS Podfile.lock aligned after changes
  to dependencies with native iOS components.
- Follow root source-size limits; split cohesive widgets/modules without changing
  public imports merely for a cosmetic line-count target.

For task-board behavior, use `$tuturuuu-mobile-task-board`. For shell/back handling,
overlays, cache invalidation, assistant/live behavior, or native tooling, consult
only the relevant section of
`../../plugins/tuturuuu/skills/tuturuuu-mobile-task-board/references/mobile-operating-patterns.md`.
