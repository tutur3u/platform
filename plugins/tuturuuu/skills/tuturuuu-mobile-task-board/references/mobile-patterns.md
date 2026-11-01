# Mobile Patterns

Load this reference for `apps/mobile` task-board, finance, overlay, shell, or
localization changes.

## Verification And Localization

- After adding or renaming Flutter ARB keys, run `flutter gen-l10n` before
  `flutter analyze` or tests. Generated localization files are tracked.
- Use Dart formatting or `bun check:mobile` for Dart files. `bun ff` does not
  format Dart and may fail with "No files were processed."
- Run applicable mobile tests and native builds in CI for the exact authored
  commit as the normal branch verification path. A demonstrably stuck CI queue
  can defer that proof; record pending jobs and local results, then resume CI
  before calling the change release-ready.
- For simulator/emulator validation against a seeded local backend, use the
  local E2E environment (`scripts/thanh-e2e/thanh-e2e.mjs`, runbook
  `apps/docs/build/development-tools/local-e2e.mdx`). On-device flows
  belong in `apps/mobile/integration_test/`; `flutter test -d` runs other test
  files on the host VM.
- Do not manually bump `apps/mobile/pubspec.yaml` for ordinary authored mobile
  behavior changes. Release Please owns mobile version updates.
- Keep `mobile-build-ios.yaml` on CocoaPods by disabling Flutter Swift Package
  Manager in CI while `image_cropper` and `dkimagepickercontroller` resolve
  incompatible `TOCropViewController` Swift package ranges.
- Mobile iOS/macOS CI uses the current `macos-latest` GitHub runner with Xcode
  26+. `connectivity_plus` and `device_info_plus` no longer require the former
  Xcode 16.4 compatibility pins. Revalidate the runner image and native builds
  before introducing a future Apple-specific dependency pin.
- Keep `mobile-deploy-stores.yaml` beta-only: production pushes may publish the
  production flavor to Google Play internal testing and TestFlight, but should
  not submit production store releases. CI stores only
  `MOBILE_DEPLOYMENT_CI_TOKEN` in the `mobile-store-beta` GitHub Environment,
  then fetches `.env.github`, Firebase, signing, and store resources from the
  root workspace apps/web mobile deployment vault after GitHub OIDC validation.
  Local verification must prove the Android AAB build, while iOS IPA
  verification requires full Xcode before it can be claimed.

## API Origins And Authentication

- Mobile uses Supabase access-token Bearer authentication against both the
  platform and registered satellite origins. A satellite proxy must let a
  syntactically valid bearer credential reach route-level authentication
  instead of requiring a browser app-session cookie first. Use
  `hasAuthenticatedBearerToken(request.headers)` from
  `@tuturuuu/utils/api-proxy-guard` only as an edge pass-through signal; route
  handlers remain responsible for validating the token and authorization.
- Keep `scripts/check-mobile-api-mappings.js` aligned with every configured
  mobile satellite origin. It verifies canonical route ownership and ensures
  each satellite proxy preserves bearer-authenticated mobile API access.

## Layout And Spacing

- Build page bodies with the `core/layout/layout.dart` primitives
  (`AppPageListView`, `AppPageScrollView`, `SliverAppPage`, `AppPageBody`) and
  `AppSpacing`/`AppLayout` tokens. Do not hand-write page gutters, wrap a
  scrollable in `ResponsiveWrapper`, or add ad-hoc scroll-end constants to
  `MediaQuery.paddingOf(context).bottom`.
- Use `AppPageBody.fullBleed` only for listed screen types: calendar views,
  kanban/board and planner canvases, chat/Assistant threads and Live, Meet call
  stages, and media/map viewers or full-canvas editors.
- Pick the page kind per screen (`root` grids and multi-pane, `detail` lists,
  `form` data entry, `reading` long text); the design-system page lists current
  assignments. Size grids and cards from `LayoutBuilder` constraints, not the
  window width, and drop widget-level 16dp side margins once the page pads.
  Sheets and dialogs keep their own padding. For `ListView.separated` or grids,
  pass `AppPageInsets.of(context, width: constraints.maxWidth)` as padding.
- Group rows with `AppGroupedSection`/`AppGroupedCard`. Build rows from
  `AppGroupedRow` + `AppIconTile` with an `AppTone`, loading from
  `AppSkeletonRows`, and empty/error states from `AppStateMessage` (`.inline`
  inside a card); feature-specific row widgets compose these. Expanded tablet/desktop windows use the leading
  `ShellNavigationRail`, which must keep the mini-app Back item. Switching
  dock and rail must not change the shell body's tree shape; regressions
  assert a visited root tab is not remounted, because routed pages survive
  through the navigator key.
- List/detail screens use `AppMasterDetail`, which splits at a body width of
  720dp or more. Keep the selection in feature state. Fold a pushed detail
  route back into the pane through `AppMasterDetailRouteBody`, because covered
  routes are not laid out. On split layouts, the first Back closes the pane.
  Suites that cover the compact push flow call `usePhoneSurface()`: the
  default 800x600 test view is a split layout.
- Open details from the row summary in the same frame and hydrate the body
  afterwards; never await the network before navigating. Keep prefetching
  bounded and replaceable (Mail: two concurrent requests, eight queued, one
  attempt, cancelled when the visible rows change).
- See the [mobile design system](../../../../../apps/docs/build/development-tools/mobile-design-system.mdx)
  and its layout/rail regression tests.
- Redesigned mini apps compose `package:mobile/core/ui/kit/kit.dart`
  (`AppSummaryHero`, `AppSectionHeader`, `AppStatTile`, `AppPanel`,
  `AppRichRow`, `AppFilterBar`, `AppSegmentedControl`, `AppAdaptiveGrid`,
  `AppGroupedSlice` for lazy grouped lists) and follow the
  [mobile design language](../../../../../apps/docs/build/development-tools/mobile-design-language.mdx):
  one hero per root, one `AppTone` per app, no shadows or blur on list
  content, and render evidence from `test/helpers/design_render_harness.dart`.
  CMS (`features/cms`) is the reference migration; retire `finance_ui.dart`
  widgets per app using the mapping table there.

## Design System And shadcn Removal

- Import `package:mobile/core/ui/ui.dart`, not `package:shadcn_flutter` or its
  shims. `scripts/check-mobile-shadcn-imports.js` (CI Mobile Analysis and
  `bun check:changed`) fails on new importers and on stale entries in
  `apps/mobile/tool/shadcn_import_allowlist.txt`. After migrating a file, run
  `node scripts/check-mobile-shadcn-imports.js --prune`; never add entries
  (the check compares against the base revision's allowlist and parses
  conditional and relative import URIs).
- Use the mapping in `apps/docs/build/development-tools/mobile-shadcn-migration.mdx`:
  `AppTokens.of(context)` for `shad.Theme.of`, `AppGap`, `LucideIcons` from
  `core/ui/icons/app_icons.dart`, `AppButton.*`, `AppIconButton(tooltip:)`,
  `AppTextField`, `AppCard`, `AppBadge`, `AppAlert`, `AppSwitch`,
  `AppCheckbox`, `AppToggleRow`, `AppCheckboxRow`, `AppChip`, `AppSlider`,
  `AppSelect`, `showAppDatePicker`, `showAppTimePicker`, `showAppToast`,
  `AppScaffold`. Run
  `scripts/mobile-shadcn-codemod.js` for the mechanical Gap/Theme/icon renames
  on whole libraries; part files inherit their library's import.
- Colours come from `AppColorTokens`, a `ThemeExtension` derived from the
  appearance scheme; do not hard-code hues or read shad colour schemes in new
  code.

## Overlays And Shell

- Open sheets and dialogs with `showAppSheet` / `showAppDialog` and lay them out
  with `AppSheetScaffold` / `AppDialog`. Menus use `showAppActionSheet`; single
  choices use `showAppChoiceSheet` (also behind `AppSelect`). Do not call
  `shad.openDrawer`, `shad.showDialog`, `shad.showDropdown` or raw
  `showModalBottomSheet`, and do not hand-draw drag handles or a second sheet
  background (use `AppSheetHandle`). `showAdaptiveSheet` remains a
  compatibility path that draws the same `AppSheetSurface`, handle and
  keyboard inset, with the same Back binding.
- Dialogs and fit sheets consume keyboard insets at the host boundary. Do not
  add a second IME padding layer in their bodies. Verify phone paths with a
  keyboard open and tap OK/Save; a tablet-only picker test does not cover them.
- Back must close the topmost overlay first. `AppModalBinding` registers a
  modal entry in `ShellChromeActionsCubit`, so `ShellPage.didPopRoute`, dock
  Back and Android Back resolve to the overlay. A sheet on the shell's nested
  navigator is invisible to `Navigator.of(context, rootNavigator: true)`,
  which is why custom Back handlers must not pop routes directly.
- Searchable sheets pass `search: AppSheetSearch(...)` so the dock shows a
  dynamic search action and the top navbar becomes the query field. Do not add
  an inline search field inside the shell; the scaffold falls back to one only
  when no `ShellChromeActionsCubit` exists. Dispose the sheet's query
  controller after the frame because the shell field may still hold it.
- Verify sheets inside the real shell (`_SettingsHarness.pump(shellChrome:
  true)`), including system Back, dock Back, keyboard insets at 320x568 with 2x
  text, and renders through `SETTINGS_RENDER_DIR`.
- Shell actions should open overlays immediately and let overlay content fetch
  or refresh on mount instead of blocking the tap on pre-open network work.
- Loading states use `AppLoadingIndicator` (`core/ui`), never a bare
  `NovaLoadingIndicator`: `.page()` for a page, pane or full-screen gate (56dp,
  centred), the default section size (32dp) for cards and list footers, and
  `.inline()` (20dp) for buttons and row slots. A full-screen loader must not
  use a section or inline size. Cold list loads still prefer `AppSkeletonRows`.

- Settings rows use `SettingsRowLayout` and `SettingsTile` (re-exported from
  `settings_widgets.dart`) for consistent heading/icon insets, text slots and
  trailing controls. Stack multiple actions in the fixed 44px trailing column;
  keep each action's localized tooltip and touch target. Consume inherited dock
  padding inside scroll content. Verify geometry and scroll-end clearance with
  `settings_compact_navigation_test.dart`; presentation changes must not alter
  timezone cubits or repositories.
- Settings sub-page forms compose `SettingsSwitchRow`, `SettingsChoiceRow`
  and `SettingsFieldRow` inside `SettingsCompactSection` cards; see
  `mobile-settings-shell.mdx#settings-sub-page-forms`. Every text input needs a
  localized placeholder; `input_placeholder_audit_test.dart` enforces it, with
  `// input-placeholder: exempt <reason>` for rare deliberate exceptions.
- Settings groups are rounded cards (`SettingsGroup`, `SettingsCaption`) with
  dividers at `SettingsRowLayout.textColumn`. Use `SettingsRowLayout.groupFill`
  for grouped fills so ambient appearances get the translucent card.
- App settings have one editor, under Settings > Apps. Register the app in
  `product_settings_registry.dart` with a value summary and search keywords.
  Add its routed sub-screen id to `Routes.centralAppSettingsIds`. Point the
  in-app gear at `Routes.settingsAppPath(id)` and reload on return; do not add
  another settings sheet. Keep permission gates on the central row, such as the
  Timer threshold.
- Appearance colours live only in `core/theme/appearance/appearance_palettes.dart`.
  Read derived tokens via `AppTokens.of(context)`, and keep
  `appearance_contrast_test.dart` green when adding a palette or accent.
  `AppearanceBackdrop` makes shad scaffolds transparent for Gradient/Blobs;
  full-screen modal content must use the adaptive sheet helpers or
  `AppearanceScope.opaqueScaffolds`. Ambient motion must stay opt-in, timer-driven
  and painter-only, and must stop under reduced motion.
- Interface style, density and corners are `AppInterfaceTokens` on the
  Material theme. Read radii and row heights through
  `AppTokens.of(context).interface`, never by platform checks. The Settings
  shell harness pumps once, so assert a stored appearance by pumping with it,
  not by changing it mid-test.
- Home workspace chips read pins from the `MOBILE_PINNED_WORKSPACES` user
  config only from five workspaces, and allow edits only after a successful
  load, retrying a failed load with backoff and on resume. Start focus treats
  a paused session (stopped with an open break, `type=paused`) like a running
  one and stops it before starting; a failed start resumes and re-pauses it
  rather than losing it.
- Root tabs are Home, Apps, Mira, Inbox and You on an icon-only dock;
  `shell_viewport_checks.dart` asserts the dock has no text. Home, Inbox and
  You have no Search action; a screen offers Search only for its own content,
  always through `ShellActionSpec.search` (one glyph, dock slot and target).
- Do not show bare count chips or badges; a count must open what it counts.
  Show a control only while it can act rather than registering it disabled.
- Prompt composers lay out through `AppComposerRow` with
  `AppComposerRow.fieldPadding`, so one line centres with its controls and
  extra lines grow upward with controls on the last line.
- Before editing `assistant_page.dart` or `assistant_page_layout.dart`, check
  the open Mira chat PRs that own them; keep tab polish in owned widgets such
  as `assistant_starter_prompts.dart` until those land.
- The device Pomodoro is `PomodoroController` (app-level). Focus phases are
  ordinary tracker sessions; restore catch-up never auto-starts focus and
  trims late stops to the deadline. In widget tests, close the controller in
  the test body only; a second close in `tearDown` hangs outside fake time.

## Task Board

- Preserve external/personal task semantics when changing board views.
- Deep links should use the board route contract:
  `/{wsId}/tasks/boards/{boardId}?task={taskId}`.
- Mobile board management mutations should use the current
  `/api/v1/workspaces/{wsId}/task-boards/{boardId}` app-session routes for
  archive, restore, soft delete, and permanent delete. Avoid older board APIs
  that only accept cookie sessions.
- Recycle-bin bulk actions should mutate without reloading per task, update
  local drawer state per item, then perform one final reload.
- Refreshes must prune stale selected task IDs against the currently loaded
  deleted-task snapshot.
- Delete busy state should cover the full confirmation mutation, not only the
  post-success close/toast path.
- Assignee avatar stacks should size from actual occupied width so overflow
  badges do not create stray gaps or clipping.
- List-view task rows use `AppSwipeActions` plus a long-press
  `showAppActionSheet` menu that reuses the board cubit mutations. Selection
  mode disables swipes. Board-page mutations invalidate `CacheStore`, whose
  file work never finishes in fake async: assert on the repository call and
  the busy dialog instead of waiting. To chain mutations, call
  `CacheStore.instance.init` in `setUpAll`, wait with `runAsync` plus pumps
  until `isMutating` clears, and keep that test alone in its file. The store
  is a process-wide singleton that serializes writes, so a write left
  pending by an earlier test blocks every later mutation
  (`task_board_quick_actions_edits_test.dart`). Do not add a timer-based
  timeout there: its pending timer fails every board widget test whose
  mutation never settles in fake async.
- Priority visuals and labels come from `TaskPriorityLevel`
  (`tasks_boards/widgets/task_priority_visuals.dart`): the web's order and
  wording (Urgent, High, Medium, Low, plus None), Lucide and Lucide Lab icons
  and dynamic colours. Do not add per-surface priority strings or hues. The
  design render harness loads both Lucide fonts.
- Board mutations reject a concurrent call with
  `TaskBoardMutationInProgressException` (an `Exception`) before any
  optimistic change; call `_ensureNoMutationInProgress` first in new
  optimistic mutations.
- Overdue is one rule (`utils/task_due_dates.dart`): the due day in the
  user's timezone setting is before today. No due date, never overdue.
- Save a picked day in the timezone setting with `taskStartOfDayIn` /
  `taskEndOfDayIn`, and carry existing dates through `taskInZone`. The task
  repository snaps a `tz.TZDateTime` to its own zone's day but a plain
  `DateTime` to the device's day, so a plain date can shift a day in the
  board's zone. A sheet opens above the page: re-provide a page-scoped
  `TimezoneSettingsCubit` to it, as the quick sheet does, or it reads device
  days (`task_board_quick_actions_dates_test.dart` covers both).
- The tap quick sheet follows the cubit for its task and passes the live task
  to every edit, so consecutive edits never save a stale snapshot. Edits made
  where the saved value is visible pass `announce: false` (no success toast;
  a toast there covers the next picker's footer). Drop taps while the cubit
  `isMutating`; its single-mutation guard throws a `StateError`, not an
  `Exception`.
- Pass the page context, not the root navigator's context, to
  `showAppToast`; the root navigator's element sits above its overlay. Keep the
  root-navigator context only for legacy `shad.showToast` callers.
- Optimistic `TaskBoardDetailCubit.updateTask` restores the pre-edit snapshot
  on failure before the server refresh; do not rely on the refresh alone.
- The board timeline is an agenda (`utils/task_board_timeline_agenda.dart`):
  a pure model plus `TaskTimelineAgendaCache`. `filteredTasksByListId`
  regroups into new collections on every build while reusing task objects, so
  memoize on element identity, not map identity. The view is one
  `CustomScrollView` with `center:` on today's sliver; slivers before the
  centre grow upward, so their items are stored bottom-up. Keep rows lazy
  (`SliverList.builder` with per-row card segments) rather than building a
  day's card as one widget. Date-placed views must load every page of the
  lists they summarize (`task_board_detail_page_timeline_loading.dart`,
  policy in `utils/task_board_timeline_paging.dart`: 100 per page, two lists
  at a time, a 2,000-task board budget) and must not state that a day is
  empty while pages remain. Do not page from `setView` or a scroll trigger:
  they bypass the budget and cap, and a near-bottom trigger made the
  all-pages tests pass without the scheduler. Prove such a test by disabling
  the scheduler and watching it fail. `_emitListTasksPage` processes only the
  arriving page (its descriptions and its list); keep it that way.
  `moveTask` checks for a running mutation before bumping
  `_loadRequestToken`; a rejected move must not orphan in-flight list reads. Test fixtures should
  serve tasks only through `getBoardTasksForList` and honour `limit` and
  `offset`; board-detail tasks hide paging bugs.

### Estimation recovery

Validate estimation rows through `TaskEstimateBoard.listFromJson` for both API
responses and cache decoders. Parsing after `CacheStore.peek/read` escapes its
corrupt-record recovery boundary. Convert invalid input to `FormatException`
so the estimation cubit can publish its existing error state; do not catch every
programming error. Check closed/superseded loads before publishing asynchronous
results. Keep estimation form actions inside the scrollable content so title and
actions cannot exhaust a small dialog at enlarged text sizes. The model, cubit,
and dialog tests under `apps/mobile/test` cover these boundaries.

## Finance

- Finance amount visibility is app-scoped. Persist through settings, expose it
  from a root cubit, and reuse the same shell action on all finance routes.
- Shared transaction accordions should expose configurable edge insets so page
  gutters stay owned by the page.
- Normalize transfer activity so mirrored transfer rows render once per linked
  pair.

## Chat And Assistant

- Mobile Chat must call `apps/web` chat APIs with app-session Bearer auth; do
  not read private chat tables or Supabase directly from Flutter.
- Chat push payloads open `/chat` with `openTarget: "chat"`, `wsId`,
  `conversationId`, and `messageId`. Route only explicit conversation members;
  do not broadcast channel notifications to all workspace members.
- Keep the Assistant center tab, but create new Assistant text conversations as
  native Chat `type="ai"` conversations and send text through the chat message
  stream. Live mode remains an explicit Assistant Live entry.
- Restore text history from `metadata.ai.parts`, including bounded text offsets,
  before legacy `parts` or content fallbacks. Long completed replies keep full
  structured text with a bounded content preview. Use the save/reopen/follow-up
  cases in the [Assistant chronology guide](../../../../../apps/docs/platform/features/assistant-live.mdx#conversation-chronology-and-native-presentation);
  terminal parser fixtures alone do not exercise server persistence.

- Native Assistant terminal batches are authoritative lists, not successive
  replacements for one temporary reply. Restore every row from canonical parts.
  Cache revalidation must publish to the still-current conversation as well as
  disk; fence navigation, settings writes and newer local turns. SSE errors require bounded
  request-scoped save readback before failure, without regenerating a response.
  See `native-ai-stream-persistence.test.ts`, `assistant_chat_saved_batch_test.dart`
  and `assistant_chat_revalidation_test.dart` for the focused regressions.

- For real Assistant host fixtures, use the canonical
  [mobile state and lifecycle guide](../../../../../apps/docs/build/development-tools/mobile-state-regressions.mdx#keep-asynchronous-assistant-fixtures-in-their-owning-zone).
  It covers scheduling ownership, creation admission, native attachment wire
  shapes, shell publication and subscription handshakes. Fixture success does
  not establish installed-device, provider or customer delivery.

- Assistant receipt labels are presentation evidence: only a saved-user identity
  transition permits Delivered; following response content permits Read. Never
  infer delivery from a spinner ending, a local timestamp, or restored history
  without acknowledgement provenance. Keep dock geometry tests on the actual
  persistent shell dock, and exercise streaming follow with large output chunks
  and a reader scrolled into history. Coalesced post-frame followers must request
  a visual update when scheduled while idle; adding a post-frame callback alone
  does not request a frame. Cover idle resume as well as content-driven rebuilds.

### Calendar description display

Calendar descriptions are arbitrary provider HTML, Markdown or plain text, not
TipTap JSON. Reuse `CalendarDescriptionBody` for full details and
`calendarDescriptionPreview` for compact agenda text. Both are display adapters;
never persist normalized output or change form/provider payloads. Keep rendering
native through `flutter_markdown_plus`, block remote images and executable
HTML content, and use the existing mobile link launcher URL policy. Calendar's
widget regressions cover both raw `<p>` and Markdown source, malformed/mixed
content, formatting, URL rejection and accessible enlarged text. A widget fixture
is not installed-device or provider delivery evidence.

## Mail notification entry privacy

- Keep Mail push routing actor-bound and UUID-only, then verify mailbox bootstrap
  before reading detail. Managed subdomain syntax is launcher discovery only.
- Pass notification-entry image suppression through the owning Mail reader chain;
  explicit reveal changes that reader, not the saved image preference. Preserve
  the entry intent across failed-open Retry. Do not grow the generic push service.
- Use `mail_notification_privacy_test.dart` and existing push/dismissal tests.
  Device arrival and timing require separately authorized device fixtures; see
  [Mail notification evidence](../../../../../apps/docs/platform/applications/mail-inbound-notifications.mdx).

### Profile banner capability uploads

Reuse the existing profile repository and signed banner receipt flow; retain the
operation UUID through upload/finalize retries. Crop banners at 3:1 before the
shared optimizer, keep placeholder/loading/error geometry stable, and reload the
actor-owned profile after mutations. Classify optimizer size exceptions separately
from invalid images and signed PUT ticket failures separately from API permission
denials. See the mobile profile banner section in
`apps/docs/platform/features/user-management.mdx` and the focused banner lifecycle,
picker, image-state and repository failure-contract tests.

### Migrating scoped editors to sheets

When a scoped settings route opens as a hosted sheet, forward its captured
AuthCubit and WorkspaceCubit with value providers even on a nested navigator.
A navigator does not inherit providers placed inside its sibling page route.
Retain the original scope-generation invalidation and cancel both parent and
child sheets on account/workspace transitions, including switching away and back.

Resolve localized titles from the context passed to the editor builder. An
opening page can be deactivated while a departing sheet rebuilds; a captured
parent context is unsafe even when the new editor remains mounted. Keep the
actual actor/workspace ABA tests and late-write assertions when changing the
presentation.

Toggle and checkbox rows activate from their labels as well as their controls.
Toast handles cancel their timers when their overlay is disposed. Regression
coverage lives in app_toast_lifecycle_test.dart,
assistant_personality_route_scope_test.dart and assistant_routed_editors_test.dart.

A covered ancestor can pause a nested navigator's exit animation. Scope
invalidation removes the exact owned settings route instead of waiting for a pop
animation; it must preserve an unrelated covering route. The settings shell ABA
checks cover this cancellation while the editor is covered.

## Build-free Startup Inspection

Trace pre-`runApp` awaits in `lib/bootstrap.dart` separately from root-provider
construction and unawaited locale/product loads in `lib/app/view/app.dart`.
Optional public model-transfer restoration uses `scheduleOptionalStartup` after
first paint; keep required identity, appearance, encrypted cache and mutation
recovery before the root mounts. Preserve feature-owned retry/error handling.
Use `test/core/startup/optional_startup_test.dart` for paint ordering and failure
containment; run `test/core` and `test/features/shell` for bootstrap-adjacent
regressions. Asset bytes/dependency lists are static candidates, not release
bundle or device startup measurements. See the Mobile application guide's
startup recovery section for the default and platform scope.

### Mastermind inline answers

Home/Inbox cards and item detail must share `MastermindRepliesCubit.queueOption`
and its five-second Undo window. A2 `hub_options` are display labels in canonical
option order; preserve the original `option_index`, version hash and outbox
label. Fall back to canonical options when short-label counts differ. Never
infer hub resolution from a local tap or accepted reply. Exercise the real
reply cubit with fake transport in `decision_cards_test.dart`; English/Vietnamese
at 320px and 2x text catch wrapping regressions without a device build.

### Independent startup state restoration

Use `initializeStartupState` only after Firebase/observability and Supabase settle.
Appearance may overlap offline restoration; keep CacheStore before the queue and
skip the queue on cache failure. Preserve branch fallbacks, error/stack reporting
and the pre-`runApp` join. Completion-barrier tests live in
`test/core/startup/startup_state_test.dart`. See the Mobile application guide's
[ordering contract](../../../../../apps/docs/platform/applications/mobile.mdx#independent-startup-state-restoration).

## Analytics and crash sharing

- Keep collection changes behind `TelemetryPreference` and the production-only
  gate in `MobileObservability`. Read the persisted device choice before Firebase
  initialization; native defaults remain disabled. Collection is off until an
  explicit Allow in every region: add no locale, region or network-based default.
  The stored answer carries a notice version; bump it with any consent wording
  change so users are asked again.
- Keep no advertising identifier: the Android AD_ID and ACCESS_ADSERVICES_AD_ID and ACCESS_ADSERVICES_ATTRIBUTION permissions stay removed and
  iOS keeps `$FirebaseAnalyticsWithoutAdIdSupport` and the ADID Info.plist key.
- Older builds persisted SDK collection-on, which beats manifest/Info.plist
  defaults. Keep the native gates (Android `TelemetryConsentGateProvider`
  above `FirebaseInitProvider` and `TelemetryCollectionLockProvider` after it,
  iOS `willFinishLaunching` and right after `FirebaseApp.configure()`) and Dart's
  unsent-report deletion when collection is off; recheck the gate keys on SDK
  upgrades. Session transitions call `TelemetryPreference.reloadConsent()`.
- The first-run prompt (`TelemetryConsentPage`, `/telemetry-consent`) is driven by
  `TelemetryPreference.consentPending` and the router redirect in
  `app_router_telemetry_consent.dart`; it is production-only, opens above the
  shell, has equal-weight answers (back gesture = Don't allow) and persists
  through `setEnabled`.
- See `apps/docs/platform/features/mobile-telemetry-privacy.mdx` for the consent
  rules, notice versioning and exceptions. Verify startup ordering,
  persistence, native defaults and Settings controls with the telemetry suites.

## Mastermind Machines

- The read-only Machines parser lives in `features/mastermind/machines/`. Keep
  aliases and arbitrary collector prose outside the app model; display names use
  the fixed neutral table, and production hosts always retain their read-only rule.
- Missing machines and empty machines are distinct states. Preserve null metrics
  and last-known offline values. The debug sample branch must remain guarded by
  `kDebugMode`; release uses the real accepted snapshot only.
- The machine regression fixtures include hostile aliases. Run the focused
  `test/features/mastermind/machines/` suite along with Mastermind, shell and router
  coverage. Collector schema freeze, hub acceptance and security review remain
  separate from widget/parser verification; see the mobile Machines feature page.


### Development Firebase consent QA

Follow `apps/docs/platform/features/mobile-telemetry-privacy.mdx` for consent QA.
Check both Dart options and native resources: differing app IDs do not imply
separate Firebase projects. Development must use `tuturuuu-mobile-dev` before
turning on `CONSENT_GATE_QA` in debug/profile mode; release ignores the flag.
Apple flavor plists and Android development `google-services.json` are committed
public client configuration. PR workflows must receive no Firebase CI secret.
Do not substitute the production deployment bundle or a dummy config for device
acceptance. Google OAuth client fields are optional for telemetry-only Firebase
registrations; Google Sign-In acceptance needs separately provisioned clients.


## Firebase startup and consent

Keep Firebase unconfigured while signed out. The mobile startup callback belongs
to PushNotificationService.startSession; telemetry preference loading must not
configure SDKs. Keep app-wide collection and Messaging auto-init off natively,
including persisted Messaging overrides. Android removes FirebaseInitProvider.
iOS defers APNs registration through the worktree-local Podfile source patch;
never edit the shared Pub cache. Verify that patch against upgraded FlutterFire
source and require CI native compilation.

Push needs a signed-in actor, the push setting and OS permission, independently
of analytics consent. Push-off drains registration writes, deletes the FCM token
and removes the server device row; sign-out performs cleanup before auth removal.
See apps/docs/platform/features/mobile-telemetry-privacy.mdx and the focused
push_token_permission_gate_test.dart. Device traffic capture remains necessary
to establish network silence.


Analytics can initialize independently of FirebaseApp: FlutterFire 12.5.0 does
so on Android engine attachment. Keep its generated source lazy, disable the
Measurement receiver/service/job until signed-in Allow, and reset both persisted
Measurement enable flags synchronously before any SDK call. iOS12.18 also stores
an enable enum in standard defaults and the Measurement plist; reset both before
Firebase configuration. Native upgrade tests must seed enabled overrides, retain
unrelated preferences and prove the first SDK read sees disabled. See the
mobile telemetry privacy page for version-specific storage keys and commands.
