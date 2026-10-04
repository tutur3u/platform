# Mobile Flutter/Dart Rules

Root `AGENTS.md` applies. Use `uv` only for Python; mobile uses the checked-in
Flutter/Dart toolchain and app package configuration.

- Run `flutter gen-l10n` after ARB changes; format Dart sources, not ARB files.
- Run `bun check:mobile` for Dart, ARB, dependency, or native configuration changes.
  Analysis info-level diagnostics fail CI. Documentation-only edits need no Flutter suite.
- Preserve user/workspace isolation in caches and permission checks. Pass request
  context through mobile Bearer-auth APIs; cookie-only helpers are insufficient.
- Cache-backed screens should show a scoped stored snapshot immediately and
  revalidate on entry, including a snapshot still marked fresh. Keep explicit
  refresh awaitable, and clear visible data on account or workspace switches.
  Use stable skeleton geometry for a cold load; avoid full-screen spinners when
  the content can retain its last authorized snapshot.
- The encrypted entity index in `CacheStore` is scoped by user, workspace,
  namespace, and source snapshot. Keep snapshot migration and entity removal
  in step with cache writes, eviction, and logout. Query with the current user
  and workspace, and overlay pending edits only for the owning path.
- Model-returning mobile writes may use `queueOrSendValue`; the pending model
  must have a stable local ID and the owning list must render its queued status.
  Keep operations that depend on a newly created server ID blocked or reconcile
  the ID before replay. Ambiguous non-idempotent writes require manual review.
- The Profile timeline must attribute actions to the signed-in user. Calendar
  rows currently lack a reliable creator and must be labeled as workspace
  activity. Keep note content and private activity out of shared profile reads.
- Shell-contained settings and detail screens inherit the shell background and
  use its single top navbar title/back control. Never add an inner AppBar/body
  topbar or a second top SafeArea. Include shell-provided bottom MediaQuery
  padding in scroll content for floating-dock clearance. Full-screen forms and
  system-owned flows open above the shell. Test top-navbar, Android system and
  dock back, including direct deep links and enlarged text.
- Use `AppHaptics` for semantic pickup, selection, drop, success, and warning
  feedback. Respect the persisted Preferences toggle and throttle repeated
  gesture feedback; do not vibrate for background refreshes or replay.
- Queue adapters should provide an optimistic item and stable client identifiers
  for non-idempotent writes, especially money and messages. When an endpoint
  cannot deduplicate uncertain attempts, retain the edit as a manual conflict
  instead of replaying it automatically. Show unsynchronized rows through
  `PendingSyncFrame` until confirmed.
- Release Please owns release versions. Keep iOS Podfile.lock aligned after changes
  to dependencies with native iOS components.
- Store CI must verify archived iOS dSYM UUIDs and upload symbols to Crashlytics
  before TestFlight distribution. Preserve the dSYM artifact for recovery.
- Follow root source-size limits; split cohesive widgets/modules without changing
  public imports merely for a cosmetic line-count target.

For task-board behavior, use `$tuturuuu-mobile-task-board`. For shell/back handling,
overlays, cache invalidation, assistant/live behavior, or native tooling, consult
only the relevant section of
`../../plugins/tuturuuu/skills/tuturuuu-mobile-task-board/references/mobile-operating-patterns.md`.
