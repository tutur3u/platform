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
- Group rows with `AppGroupedSection`/`AppGroupedCard`; row layout stays with
  the owning feature. Expanded tablet/desktop windows use the leading
  `ShellNavigationRail`, which must keep the mini-app Back item. Switching
  dock and rail must not change the shell body's tree shape; regressions
  assert a visited root tab is not remounted, because routed pages survive
  through the navigator key.
- See the [mobile design system](../../../../../apps/docs/build/development-tools/mobile-design-system.mdx)
  and its layout/rail regression tests.

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
  with `AppSheetScaffold` / `AppDialog`. Do not call `shad.openDrawer`,
  `shad.showDialog`, `shad.showDropdown` or raw `showModalBottomSheet`.
  `showAdaptiveSheet` remains a compatibility path with the same Back binding.
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
- Full-surface loaders should use `NovaLoadingIndicator`; native/spinner
  variants are for compact inline affordances.

- Settings rows use `SettingsRowLayout` and `SettingsTile` (re-exported from
  `settings_widgets.dart`) for consistent heading/icon insets, text slots and
  trailing controls. Stack multiple actions in the fixed 44px trailing column;
  keep each action's localized tooltip and touch target. Consume inherited dock
  padding inside scroll content. Verify geometry and scroll-end clearance with
  `settings_compact_navigation_test.dart`; presentation changes must not alter
  timezone cubits or repositories.
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
