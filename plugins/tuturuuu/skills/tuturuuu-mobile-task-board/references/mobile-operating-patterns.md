# Mobile Operating Patterns

Read only the section relevant to the current feature; paths are repository-relative.

## 1. Mandatory Actions

- **Localization Generation**: Run `flutter gen-l10n` after ARB changes.
- **Clean Pass**: `bun check:mobile` is mandatory for mobile changes. It runs format, analyze, and test.
- **Analyze Info = CI Failure**: Treat `flutter analyze` info-level lints as blocking in this workspace; fix them in touched files before finishing.
- **Widget Fixture Cleanup**: Dispose `tester.ensureSemantics()` handles and restore debug platform overrides in `try/finally` before the test body returns; Flutter checks these invariants before `addTearDown`. When a transport contract changes, migrate widget fixtures as well as repository tests, preserving held-response and duplicate-write assertions. See [fixture lifecycle guidance](../../../../../apps/docs/build/development-tools/mobile-state-regressions.mdx#keep-widget-fixtures-current).
- **Flutter L10n Asset Formatting**: Do not send `.arb` files through `dart format`; format only Dart sources and regenerate `flutter gen-l10n` after ARB edits.
- **Flutter Analyze Ignore Hygiene**: Avoid speculative `ignore_for_file` directives. `flutter analyze` reports `unnecessary_ignore` as a failing issue during `bun check:mobile`.
- **Import Order Lints Can Still Block Delivery**: For new large mobile screens, expect `flutter analyze` style infos such as `directives_ordering`, deprecated form-field APIs, and constructor parameter-order lints to fail `bun check:mobile`. Do not stop at “no errors”; keep touched files info-clean.
- **Shell Chrome Registrations Need Fresh Callback Tokens**: `ShellMiniNavItemSpec` and `ShellActionSpec` equality tracks ids, labels, selected state, and `callbackToken`, but not the callback closure itself. When shell-owned actions or mini-nav items depend on changing page state, update `callbackToken` alongside the visual state or the shell can keep stale handlers registered.
- **Apps Hub Tests Should Assert Ordering, Not Temporary Chrome**: When the mobile Apps hub layout changes, prefer widget tests that verify stable module ordering and the absence/presence of search rather than hero copy, summary banners, or CTA button counts that are likely to churn with visual redesigns.
- **Opportunistic Product Warmups Must Fail Soft**: App-start and Apps hub prewarm tasks are best-effort cache fills, not required product loads. Gate them on the corresponding access cubit when a module is optional, and swallow/log `404` responses from missing endpoints instead of letting those errors escape through startup.
- **Mobile Bearer Routes Must Pass Request Into Workspace Helpers**: Web API routes that serve mobile workspace screens cannot resolve workspaces or permissions through cookie-only helpers. For mobile-facing workspace CRUD/list routes, normalize the workspace id and call `getPermissions({ wsId, request })` / `createClient(request)` so Bearer-token requests do not degrade into false `404 Workspace not found` errors.
- **Mobile Collection Endpoints Must Return Lists, Not `.single()` Payloads**: When porting a web module to Flutter, audit every collection route used by the repository layer. Mobile pagination/search screens expect list-shaped `{ data, count, page, pageSize }` responses; a lingering `.single()` collection handler can look fine in web-only code paths but breaks mobile parsing and paging immediately.
- **Join-Table Mobile Counts Must Use Real Keys On An Admin-Backed Read**: For mobile list APIs that expose derived counts from bridge tables like `course_module_quiz_sets`, do not assume the join table has an `id` column and do not rely on caller-scoped joins after access is already proven. Verify membership with the request client, then read the join on an admin-backed client and select a real foreign key such as `module_id`.
- **Shared Mobile Visual Language**: Use the v0.9.2 AppCardPalette gradients, icon blocks, and contrast model across Home, Apps, Assistant, and module entry surfaces. Reuse the shared palette and theme tokens rather than inventing separate visual systems. Keep content immediately interactive; decorative entrances must not delay taps or trigger eager data loading.
- **Mobile Task Due Dates Must Persist At Day End**: Task date pickers are date-only, but stored task deadlines are exact timestamps. Normalize mobile task start dates to local start-of-day and due/end dates to local end-of-day before sending them to the API so "due today" does not become overdue immediately after midnight.
- **Time Tracker History Period Labels Should Open Mode-Specific Selectors**: In mobile `HistoryViewMode.day/week/month`, keep the center period label tappable and open a dedicated selector sheet for that mode (day calendar, week-range list with year stepping, month grid with year stepping). Normalize the selected anchor by view mode, then reload history with the current workspace/user scope.

## 2. Engineering Standards

- **API Pattern**: Use `createClient(request)` in web API routes to support mobile Bearer token auth.
- **Widget Consistency**: Preserve per-field validation when refactoring into shared editable widgets.
- **Mobile API Error Surfacing**: In mobile form submit handlers, catch `ApiException` separately and surface `e.message` (with safe fallback) instead of only a generic toast.
- **Spreadsheet Export Sanitization**: For CSV/TSV exports that include user-controlled fields, prefix values whose left-trimmed content starts with `=`, `+`, `-`, or `@` with an apostrophe before quote escaping so spreadsheet apps do not interpret exported cells as formulas.
- **Sensitive Cache Denylist**: Do not persist workspace secrets, credentials, access tokens, or raw secret values in `CacheStore`, SharedPreferences, Hive, or other mobile disk caches. Use in-memory state only unless the storage path is explicitly encrypted and reviewed for that secret class.
- **Auth Account State Redaction**: Secret-bearing auth account models exposed through Cubit/Bloc state must exclude raw refresh tokens and session JSON from `Equatable.props` and `toString`/debug summaries. Keep secure-storage serialization separate from loggable equality and state output.
- **Supabase Logout Required For Account Cleanup**: Multi-account removal and all-account logout must not clear secure account stores or emit unauthenticated auth state unless Supabase `auth.signOut()` succeeds. Treat Google/provider logout and stored refresh-token revocation as best-effort only; surface Supabase logout failures and keep the local account visible for retry.
- **Workspace-Scoped Async State**: In Flutter screens that can switch workspaces while showing workspace-owned collections, store the collection owner `wsId`, scope loading/loaded flags by workspace, and ignore stale async responses with a request token/version check.
- **Account-Switch Refresh For User-Scoped Data**: For routes that include user-scoped payloads (for example filters/permissions keyed by current user id), add an `AuthCubit` listener on `previous.user?.id != current.user?.id` and force-refresh the route data/cached reads for the active workspace.
- **Settings Replay Baselines**: Keep confirmed snapshots separate from pending display overlays. Send only fields edited against the confirmed baseline. If an endpoint accepts full-object saves, keep cached editors read-only until fresh data succeeds. An unresolved settings write needs its own queue ordering scope and must not block unrelated module operations. Keep controls locked through restored pending edits and the post-replay fresh read; queue admission or disappearance is not server confirmation. Mail coverage lives in `mail_settings_cache_ui_regression_test.dart` and `mail_settings_offline_regression_test.dart`.

- **Workspace Permission Reads Must Not Use Local Permission Caches**: Do not memoize `WorkspacePermissionsRepository.getPermissions(...)` results in widget-level static maps keyed only by workspace id. Always resolve permissions from the repository on load/refresh/account switch so user changes cannot reuse stale access grants.
- **Workspace Resolution Loading Guards**: In workspace-dependent pages, show global loading indicators only while `WorkspaceStatus` is `initial/loading`; when resolved workspace is `null` under `loaded/error`, render a non-loading empty/error fallback instead of an indefinite spinner.
- **Workspace-Scoped SWR Caches Must Not Cross Workspace Boundaries**: When a mobile settings/detail page reuses stale cached data while revalidating, scope the cache by workspace and clear the rendered payload immediately when the active workspace changes. Do not keep showing the previous workspace's secrets, permissions, or settings while the new workspace is still being authorized or loaded.
- **Apps Hub Visibility Gates Need Cache-First Access Flags**: If an Apps hub card or mini-app visibility depends on a workspace/product access check, persist that boolean per user/workspace and restore it before revalidation. Do not hide/show hub modules only after a cold-start network round trip when the last known access state is already cached.
- **Filtered Detail Cache Keys**: In workspace-scoped Cubits that cache selected-record detail, do not reuse a loaded detail payload based only on record id when member/scope filters can change. Key the cached detail by record id plus the active scope/filter identity, or filtered views can silently show stale data.
- **Calendar release build failures**: Reproduce through the real `ShellPage` and providers, check `tester.takeException()` and `ErrorWidget`, and load bundled fonts before interpreting layout overflows. `registered_destinations_smoke_test.dart` covers registry module/mini-nav routes; `calendar_shell_regression_test.dart` covers loading, events, empty and retry states. Keep async fixtures drained and verify remote source hashes before treating a run as evidence. Existing `flutter_framework` Crashlytics stacks identify production failures; gray screenshots alone do not establish a cause.
- **Calendar timezone resolution**: Validate the effective preference with `core/utils/timezone_location.dart` before marking it resolved. Resolve native aliases with the full IANA database, upgrading a compact database when needed while preserving `tz.local`. Unsupported inherited values after an acknowledged save are resolution failures; retain the saved preference instead of reporting the write as failed. See `calendar_timezone_failure_test.dart`.
- **Backend Timezone Identifiers**: For mobile requests that send timezone context to web/API routes (for example time-tracker stats or assistant chat), do not use `DateTime.now().timeZoneName`. Resolve and reuse an IANA timezone identifier via `flutter_timezone` (or the shared timezone helper), because offset-style labels like `GMT+07:00` / `+07` can be interpreted with the wrong sign by backend timezone logic.
- **Gemini 3.1 Flash Live Must Stay Audio-Only**: Keep Live API session configs for `gemini-3.1-flash-live-preview` on a single `AUDIO` response modality in both ephemeral token constraints and socket `setup` payloads. Use input/output audio transcription for inline text; requesting simultaneous `TEXT` and `AUDIO` outputs can break token minting or session setup.
- **Live Bootstrap Should Bundle Session Handles**: When mobile opens assistant live mode, return the latest resumable `sessionHandle` from `/api/v1/assistant/live/token` and let the client reuse it directly. Only load seed chat history when there is no resumable handle or the user explicitly requests a fresh live session; avoid a separate pre-connect `/api/v1/live/session` read on the critical path.
- **Workspace List Mutation Cache Invalidation**: In cached workspace list cubits, any successful mutation that can move a record between filters (for example pending -> approved) must invalidate every workspace-scoped cache variant before reloading, and should reconcile the in-memory list immediately so stale items do not persist if the follow-up refresh fails.
- **Manual Refresh Must Bypass Fresh Cache**: For pull-to-refresh or explicit retry actions on cached mobile lists, thread a `forceRefresh` path through the loader so user-initiated refreshes always hit the repository/network and then rewrite cache instead of returning early from a fresh cache hit.
- **Flutter Toast Overlay Context**: In `shadcn_flutter`, call `showToast` with a context captured from `Navigator.of(context, rootNavigator: true).context` before async gaps; when passed through a helper after `await`, add `if (!toastContext.mounted) return;` at the call site.
- **Async Context Lint Guard**: For async handlers that call overlay/navigation helpers after `await`, add an explicit `if (!mounted) return;` immediately before using `context` even if other stale-request guards exist; this keeps `flutter analyze` (`use_build_context_synchronously`) clean.
- **Async Cubit Emit After Dispose**: In stateful mobile pages that own cubits and kick off async loads during rebuilds or workspace switches, guard post-await emits with `isClosed` (or an equivalent helper) so route changes and tab switches cannot throw `Cannot emit new states after calling close`.
- **shadcn Drawer Dismissal Parity**: For overlays opened with `showAdaptiveDrawer`/`shad.openDrawer`, dismiss compact drawers with `shad.closeOverlay(context)` (or `Navigator.maybePop`) instead of `Navigator.pop` from drawer-local contexts.
- **Adaptive Drawer Dismiss Helper**: For overlays opened through `showAdaptiveDrawer`, prefer `dismissAdaptiveDrawerOverlay(context)` over direct `Navigator.maybePop(...)` in feature code so compact shad overlays close without bubbling a failed pop into shell back handlers.
- **Async Overlay Dismiss Strategy Capture**: If an adaptive drawer/dialog action awaits a mutation before dismissing the current overlay, capture the dismiss strategy (`closeOverlay` vs `Navigator.maybePop`) before the async gap instead of re-deriving it from responsive layout afterward. Rotation or other layout changes during the await can otherwise choose the wrong dismissal path.
- **Overlay Back Listener Dismissal Guards**: In `BackButtonListener` handlers for adaptive sheets/dialogs, use `Navigator.maybePop(...)` (awaited) rather than `Navigator.pop(...)` so route-level pop guards can veto dismissal.
- **Async Sheet Submit Discipline**: In create/edit bottom sheets and dialogs, await async submit mutations before `Navigator.pop`, keep a loading state on the primary action, and block dismissal while the mutation is running.
- **Flutter initState Inherited Access**: Do not read inherited values (for example `context.l10n`, `Theme.of`, `Localizations.of`) synchronously in helpers triggered from `initState`.

## 3. Mobile UX & Shell Patterns

- Named settings pages use their route's `GoRouterState` location. Imperative
  settings editors use the current `GoRouter.state.matchedLocation`; the router
  configuration URI can still name the earlier root after a push. Modal actions
  use `AppModalScope` and its owner instead; do not resolve a GoRouter page from
  a pageless dialog. Exercise dialog open, dock Back and restoration of the
  underlying Save action (`assistant_settings_dock_route_test.dart`). In shell
  fixtures, pass `state.uri.path` as the active location through navigation.
- Bulk download service failures retain the requested modules, network consent,
  Retry-After deadline and bounded retry budget. Keep ordinary cached reads
  independent, never drop the bulk marker as an outage workaround, and distinguish
  source readiness from deployment activation. See the mobile workspace tools
  feature page for the serving-app map and activation prerequisites.


- **Immersive Mobile View Transitions**: When toggling between fullscreen/immersive and overview modes, reset scroll position deliberately and recompute bottom insets for restored nav/FAB chrome.
- **Single Shell Detail Chrome**: Register dedicated settings/detail destinations in the app router so the shell owns their title and floating-bottom-navbar back behavior. Top navbars never contain Back buttons. Shell bodies inherit its background and header clearance, omit nested AppBars/body topbars and duplicate top SafeAreas, and consume bottom MediaQuery padding inside scrollables for floating-dock clearance. Preserve pushed-route origin on back; direct links use the registered parent fallback. Explicit full-screen forms/system flows use the root navigator above the shell. Verify compact/enlarged-text geometry plus Android system and floating-dock back, including direct links.
- **Compact Shell Safe Areas**: Pages rendered inside `ShellPage` already sit under shell-managed app bar/footer chrome; avoid unconditional inner `SafeArea` top/bottom padding in feature pages.
- **Flutter Compact Test Viewports**: Validate new cards and hero surfaces against the app widget-test viewport, not only simulator screenshots.
- **shadcn Toast Timers in Widget Tests**: When tests trigger `shad.showToast`, drain the toast auto-close timer before teardown (for example `tester.drainShadToastTimers()` then settle) unless toast duration is explicitly overridden.
- **Settings workspace rebuilds**: Preferences selects the active workspace id and Overview selects its displayed name. Preserve workspace-switch listeners and permission revalidation while excluding unrelated workspace loading/visibility/creation updates. `settings_rebuild_test.dart` counts actual keyed row rebuilds after settling and checks rename/switch controls. Flutter's `debugOnRebuildDirtyWidget` built-once argument depends on rebuild logging being enabled; do not use it to filter this observer. Widget counts establish subscription behavior, not device frame latency or a TestFlight speedup.
- **Calendar painted date windows**: Recenter buffered dates and their horizontal offsets in the same lifecycle step, before paint. A post-frame offset repair can hide a wrong-date frame from ordinary post-pump geometry reads. Keep scoped civil-date keys and sample the painted frame before repair callbacks, with bidirectional drag controls and retained visible content. `calendar_three_day_geometry_test.dart` covers this boundary.
- **Calendar all-day height transitions**: Animate row and control extents together, leaving header geometry and minute offsets stable. Reveal only complete rows/controls, retarget from current geometry, and place immediately for reduced motion or a new scope. Retain the all-day scroll viewport across animator replacement; new attachment starts at the grid offset, including zero-height expansion. Final-geometry tests settle the transition; `calendar_all_day_transition_test.dart` checks intermediate frames, rapid reversal, text scale, themes, scope and motion interruption. This is widget evidence, not a device speed measurement.
- **Toast Timer Helpers vs Infinite Animations**: Keep `tester.drainShadToastTimers()` deterministic (fixed pumps) and avoid `pumpAndSettle` inside the helper; shell/nav animations can stay active and cause test timeouts.
- **Global App Picker Semantics**: The global `Apps` tab should always behave as an app picker entry point, not as a proxy for the last selected mini-app.
- **Hybrid Shell Navigation Policy**: In `ShellPage`, use `context.go` for top-level shell roots (`/`, `/apps`, `/assistant`, and each mini-app root) and `context.push` for mini-app child routes (for example `/tasks/boards`, `/finance/wallets/:walletId`, `/timer/history`) so Android back preserves in-app history.
- **Shell Back Handler Deduplication**: If `ShellPage` uses both `BackButtonListener` and `PopScope`, guard against the same system-back gesture being handled twice. A duplicate `PopScope` callback after a handled `BackButtonListener` event can skip the intended `/apps` fallback and call `SystemNavigator.pop()` from a mini-app root.
- **PopScope `didPop` Guard**: In `ShellPage` `onPopInvokedWithResult`, return immediately when `didPop == true`. When route changes or overlays already consumed the pop (for example workspace switches that trigger a route-stack pop), running custom back logic again can incorrectly jump from mini-app child routes back to root.
- **Shell Root Navigator Pop Dedup Timestamp**: In `ShellPage` root-navigator `canPop` branches (for example dialog dismissal), stamp the back-dispatch dedup timestamp immediately before `rootNav.pop()` so subsequent `PopScope`/dispatch callbacks treat the same gesture as already handled.
- **Shell Root Navigator Pop Dedup Source Parity**: When stamping root-navigator pop dedup state in `ShellPage`, update both timestamp and dispatch source together. Updating only timestamp can leave a stale source value and incorrectly deduplicate the next back event within the debounce window.
- **Shell Exit Confirmation Reset**: In `ShellPage`, clear the pending double-back exit timestamp when `WorkspaceCubit.currentWorkspace.id` changes. Workspace switches can keep the route at `/` or `/apps`, so route-only reset logic leaves stale exit confirmation state and makes the next back press exit immediately.
- **Shell Exit Toast Lifecycle**: When double-back exit uses `shad.showToast`, keep a reference to the returned `ToastOverlay` and close it when workspace context or route changes. Resetting only the timestamp is insufficient; the stale toast can remain visible and look like it was triggered by workspace switching.
- **Android Back Forwarding**: If Android hardware back backgrounds the activity without any Flutter `PopScope`/router callback, add a `MainActivity` `OnBackPressedDispatcher` callback that forwards to `flutterEngine.navigationChannel.popRoute()` and enable `android:enableOnBackInvokedCallback="true"` in the manifest.
- **Shell-Owned Mobile App Chrome**: When global bottom nav already provides route hierarchy and `Apps` returns to picker, do not add duplicate per-page back buttons in sub-app `AppBar`s.
- **Shared Flutter App Bars vs Test Providers**: Reusable mobile `AppBar`s that inject provider-dependent actions should gate those actions defensively or make them injectable for standalone tests.
- **ShellPage Widget Test Harness**: `ShellPage` tests must provide `AuthCubit` and `WorkspaceCubit` (the top bar avatar reads both) and should prefer compact test viewports plus bounded `pump` loops over `pumpAndSettle` to avoid hanging on persistent shell/nav animations.
- **Widget Test Router Context for shad Overlays**: If a test can trigger `showAdaptiveDrawer`, `showAdaptiveSheet`, `showToast`, or any shad overlay that installs a `BackButtonListener`, run the widget under a router-enabled app harness (`ShadcnApp.router` or equivalent). Non-router harnesses can fail with "context does not include a Router".
- **DrawerOverlay Placement in Router Tests**: For widget tests that exercise `showAdaptiveDrawer`, provide `shad.DrawerOverlay` inside the route/widget subtree, not as a wrapper above `ShadcnApp.router`. The drawer overlay must stay below the router so overlay-local `BackButtonListener`s can resolve `Router.of(context)`.
- **Dialog-Only Test Harness Pop Safety**: For dialog/widget-only tests whose save/cancel handlers call `Navigator.pop` directly, avoid a single-route GoRouter harness. Use a plain app harness or a router setup with a fallback route so `Navigator.pop` does not assert by popping the last route.
- **Native shadcn Selection Handles**: Pair the shared platform context-menu builder with `platformTextSelectionControls()` on shadcn text fields and areas. Upstream handle-less controls do not regain drag handles when only the menu builder changes. Test actual Android/iOS handle drags under the production keyboard-dismiss wrapper and preserve disabled/read-only/obscured capabilities.
- **Text Editing Outside-Tap Groups**: Customize keyboard dismissal through `EditableTextTapOutsideIntent` so Flutter's `TextFieldTapRegion` groups protect selection toolbars, handles and field accessories. Do not infer outside touches from the focused RenderBox alone. Clipboard regressions must use real toolbar pointer down, a frame, and pointer up with the IME visible; an instantaneous test tap can hide overlay disposal before the action fires. Preserve disabled/read-only/obscured policies and explicit field callbacks; delegate to the native calling action when the IME is absent rather than swallowing pointer/platform defaults.
- **Flutter Standalone Card Surfaces**: For tinted or pastel tappable cards, do not rely on `Ink` decoration without a clear `Material` ancestor.
- **Chat-First Mobile Assistant Layouts**: Keep assistant surfaces focused on transcript/composer; move secondary controls into modal settings/history surfaces.
- **Stable Shell Top Bars Across Tabs**: Keep shell navbar layout stable across Home, Assistant, and Apps; place assistant-only actions in the assistant surface.
- **Opt-In Mobile Fullscreen Chat**: Do not auto-enter fullscreen because the assistant tab opened or workspace reloaded.
- **Inline Mobile Streaming State**: Create/update the pending assistant message as soon as stream starts and keep streaming/thinking indicators inline with transcript.
- **Explicit Mobile Live Entry**: Do not auto-create Gemini Live sessions on workspace/chat load. Keep normal text chat on the standard `AssistantChatCubit` path, and only route text/audio through `AssistantLiveCubit` after the user explicitly enters live mode for the current chat.
- **Dedicated Mobile Live Presentation State**: Drive fullscreen live UI from explicit page/chrome presentation state, not from inferred transport signals such as bound live `chatId`, socket status, or restored model ids. Reconnects and restored live transcripts must not silently force the user back into live mode or overwrite the normal text-model selection.
- **Fullscreen Live Status Must Expose Detail Inline**: Do not rely on a generic live status badge or a secondary info sheet for failure diagnosis. Fullscreen live mode must render the current status detail inline, provide a primary recovery action for reconnecting/error states, and keep reconnecting states labeled as reconnecting even when a transport error reason is present.
- **Compact Live Layouts Must Prioritize Stage And Controls**: On phone-height live assistant screens, keep the voice stage and primary controls fixed first, then let transcript/history become the secondary scrollable surface. Do not stack status panels inside transcript cards in a way that can overflow beneath the bottom control rail.
- **Branded Mobile Loading States**: Use `NovaLoadingIndicator` for primary page and section loading states in `apps/mobile`; reserve circular progress spinners for compact inline actions where the Nova mark would be too large or ambiguous.

## 4. Flutter Tooling & Platform Details

- **Android compileSdk Floor for Plugin Bumps**: When upgrading Flutter plugins that pull newer AndroidX AARs, do not rely blindly on `flutter.compileSdkVersion` in `apps/mobile/android/app/build.gradle.kts`. Keep `compileSdk` pinned to `maxOf(flutter.compileSdkVersion, <required floor>)` so plugin metadata requirements (for example API 34+) do not break release builds when the inherited Flutter default lags behind.
- **Vendored Flutter Dependency Hygiene**: If a Flutter package must be patched locally under `apps/mobile/vendor`, point `dependency_overrides` at that path and exclude `vendor/**` from `apps/mobile/analysis_options.yaml` so `flutter analyze` / `bun check:mobile` validate first-party app code without turning third-party package lints into repo failures.
- **iOS Lockstep**: After bumping FlutterFire or other iOS-backed Flutter dependencies in `apps/mobile/pubspec.yaml` or `apps/mobile/pubspec.lock`, refresh and commit `apps/mobile/ios/Podfile.lock`.
- **iOS Podspec Snapshot Drift**: If dependency bumps change iOS plugin podspec constraints, run `flutter pub get`, then `cd apps/mobile/ios && pod update <affected pod/plugin>`, and commit the updated lockfile.
- **iOS Native Asset Archive Sanitization**: If App Store validation reports `Runner.app/Frameworks/*` binaries built for `IOSSIMULATOR`, add or preserve a post-embed archive script that scans Flutter native-asset frameworks and swaps in the matching `iphoneos` dylib from `.dart_tool/hooks_runner/shared` before signing.
- **Flutter Swift Package Manager On iOS CI**: Keep `mobile-build-ios.yaml` on CocoaPods by running `flutter config --no-enable-swift-package-manager` while `image_cropper` and `dkimagepickercontroller` resolve incompatible `TOCropViewController` Swift package ranges.
- **Apple CI Dependency Compatibility**: Mobile iOS/macOS CI uses the current `macos-latest` GitHub runner with Xcode 26+, so `connectivity_plus` and `device_info_plus` no longer require the former Xcode 16.4 compatibility pins. Revalidate the runner image and native builds before adding any future Apple-specific dependency pin.
- **Latest image_cropper on Xcode 16 CI**: Keep latest `image_cropper`, but patch vendored `TOCropViewController.m` in `apps/mobile/ios/Podfile` `post_install` with `#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 260000` guard instead of downgrading.
- **Dart Part Imports**: For Dart `part` files, add library imports only in the parent file that declares `part ...`.
- **Mocktail Optional Named Params in Cubit Tests**: When stubbing or verifying repository methods that have optional named parameters with defaults (for example `scope`, `userId`, `limit`, `offset`), include those named parameters in `when(...)`/`verify(...)` (or use `any(named: ...)` plus fallback values). Omitting them can make tests pass in isolation but fail under randomized ordering as call signatures diverge.
- **Mocktail Non-Nullable Positional Args**: In mobile tests, avoid bare `any()` for non-nullable positional arguments (for example `DateTime`) unless a fallback is registered in the same test scope. Prefer explicit argument values so stubs remain type-safe and deterministic.
- **Flutter View File Splits**: When a Flutter page/view exceeds module boundary threshold, keep the entry file as library root and split into sibling `part` files by concern.
- **Dashboard Revamps Should Replace Patterns, Not Recolor Them**: When redesigning Home or other top-level mobile surfaces, do not stop at palette swaps on existing admin cards. Rebuild the composition itself so hero, overview, and section content each have distinct hierarchy and interaction density.
- **Personal Workspace Deep Links Must Respect The Resource Workspace**: If a Home or notification surface opens a resource that carries its own workspace id, switch away from the personal workspace first when the target belongs to another workspace. Do not force cross-workspace task/detail routes through the currently selected personal context.
- **Rich Editor Layout in Scrollable Sheets**: For task/detail sheets rendered inside `SingleChildScrollView`, avoid `Expanded`/`Flexible` inside editor cards because the vertical constraints are unbounded in tests and compact drawers. Use fixed-height `SizedBox` (or an explicitly bounded parent) for rich editor viewports.
- **Cache-Backed Cubit Test Isolation**: If a mobile Cubit reads from `CacheStore`, clear the cache scope in `setUp`/`tearDown` for unit tests. Shared cache state can suppress repository calls and make later tests fail only when run in suite order.
- **Task Board Test Repositories Must Implement List Pagination Reads**: When widget tests use fake `TaskRepository` implementations for board detail screens, implement `getBoardTasksForList(...)` with deterministic per-list pages (including `offset` behavior). The board detail cubit now prefetches and paginates list tasks, and missing overrides can trigger real `ApiClient` HTTP calls that cause `pumpAndSettle` timeouts.
- **Task Board SWR Cache Shape Must Preserve Card Metadata**: When caching board detail or per-list task pages, serialize the same display metadata the Kanban cards use (assignees, labels, projects, relationship summaries), not only ids. Losing nested labels/member names makes cache-first renders look degraded until the network refresh completes.
- **Horizontal Kanban Should Prefetch Ahead**: In mobile board detail views, page changes should request the focused list plus the next two lists. Do not rely only on `PageView.builder` item construction, because it can fetch a single column at a time and produce visible snaps on fast horizontal swipes.
- **Board List Tab Defaults To Open Work**: The mobile board List tab should hide `done` and `closed` lists by default, but explicit status filters or list filters must show the requested terminal work. Keep this scoped to the List tab so Kanban and Timeline preserve full board semantics.
- **Task Description Inline Code Must Be Theme-Aware**: For read-only task descriptions, override Quill inline-code styling with app theme colors. Default Quill inline-code backgrounds are too light in dark mode and can make backticked text unreadable.
- **Task Detail Description Should Own Its Viewport**: Fullscreen mobile task details should render the read-only description in a borderless, bounded body that fills the available height beneath the task title. Keep edit/save controls out of the read-first surface until the edit FAB opens the editor.
- **Task Saves Should Prune Stale Assignees**: When saving a task from mobile, filter selected assignee ids through the current workspace member list and let the API drop ids that are no longer workspace members. Stale assignees should be cleaned up during save, not surfaced as an unrelated edit error.
- **Assistant Metadata Warmup Should Stay Cache-First**: Assistant shell bootstrap data (personal workspace resolution, Mira soul, task/calendar insight, credits, model catalog, and recent chats) belongs behind `AssistantRepository` cache helpers and the `assistant_metadata` warmup task. Avoid adding direct page-level network reads that bypass stale-while-revalidate.
- **shadcn Flutter TextField API**: Use supported `TextField` props like `controller`, `hintText`, and `onChanged`; do not assume `placeholder`/`leading` props.
- **Flutter macOS Script Sandbox**: Keep `ENABLE_USER_SCRIPT_SANDBOXING = NO` in `apps/mobile/macos/Runner.xcodeproj/project.pbxproj` build configurations.
- **FlutterFire CLI in Apple Build Scripts**: For iOS/macOS Crashlytics upload phases generated by FlutterFire, guard scripts with `command -v flutterfire` (or equivalent) so CI does not require a globally installed `flutterfire` binary.

## 5. Maintainability

- **Module Boundaries**: When a file grows beyond roughly 500 LOC, split it by concern and keep the original entrypoint as a thin barrel re-export so dispatcher imports remain stable.

After extracting Cubit code, keep protected `emit` access in the subclass or use
its existing publication helper; extensions do not inherit subclass access.
Recheck suppressions in both files, search callers of retired APIs, and inspect
the declared constructor before correcting test fixtures. Qualify the final
composed source; earlier parent snapshots remain diagnostic evidence. See the
[formatter context guidance](../../../../../apps/docs/build/development-tools/mobile-state-regressions.mdx)
when the local checkout lacks package configuration.

- **Mira Composer Geometry**: Enter inserts a newline and only the side primary action sends typed text. There is no fullscreen/expand draft action. Keep bounded media/audio previews, upload/removal callbacks and text selection in the inline composer. Limit dock growth to five lines and report rendered composer height for transcript padding and scroll-to-bottom clearance. The side action stays 52dp tall. Validate inside `PersistentShellDock` with wrapped drafts, text scale, IME and safe-area variants; a fixed one-line estimate is insufficient.
- **Atomic Assistant Widgets**: In `features/assistant`, default to reusable stateless widgets under `widgets/` before adding more `part` files or growing a page-level state class. Keep the page/view focused on orchestration only.
- **Assistant Send Recovery**: Distinguish an untouched actor/workspace scope from uncertain creation. Bootstrap a clear envelope under the scope lock only when the envelope, legacy selection/context, creation marker and process authority are all absent; require host acknowledgement before creation. Preserve informed recovery for legacy/pending/held state and retain drafts until a real USER receipt. Exercise first Send, rapid Sends, held ACKs and the first navbar frame (`assistant_send_recovery_test.dart`, `assistant_fresh_scope_test.dart`).
- **Assistant Reaction Operations**: Use idempotent desired-state PUT with a stable persisted operation ID; never fall back to the legacy POST toggle. Clean exact unsent/acknowledged markers independently of page scope. Logout clears journal metadata but retains operation IDs until server retirement prevents delayed writes; scope admission captures the retirement epoch. Exact-message refresh safely replays the retained intent, then reads its target. See [native reaction decisions](../../../../../apps/docs/platform/features/assistant-live.mdx#native-mobile-reaction-operations) and lifecycle/transport regression suites.
- **Assistant Message Actions**: Private Chat reactions/replies require a native conversation and an authoritative saved-message receipt; a UUID-shaped optimistic row is insufficient. Use the native reaction operation contract for uncertainty recovery and preserve message content when applying receipts. Reply jumps suspend bottom-follow and retain bubble keys through acknowledgment ID relocation. See [mobile message actions and appearance](../../../../../apps/docs/platform/features/assistant-live.mdx#mobile-message-actions-and-appearance) for supported scopes and regression targets.
- **Small File Bias**: Treat ~200 LOC for Flutter widgets and ~300 LOC for pages/views as guidance for identifying cohesive extractions. Extract shared badges, bubbles, banners, sheets, and cards into dedicated widget files early.

### Offline downloads

Use the product decisions in
`apps/docs/platform/features/mobile-workspace-tools.mdx` for offline preparation,
local search parity, and repeated dock taps. Download all must remain explicit,
scoped, sequential, paced, server-limited, and verified against durable storage;
client delays never substitute for server enforcement. Keep cache reads and
outbox overlays account/workspace scoped, preserve snapshots on verification
challenges, and leave uncertain writes in review. Reuse ApiClient's preparation
Zone so background work does not open captcha modals. Full downloads must use
the same cache keys and payload shapes as normal reads; test first offline visits
with normal UI page sizes rather than only the prepared request parameters.

Use shell titles rather than duplicate body titles. Put grouped section switches
rightmost and auxiliary actions before them. Profile sections should adapt to
width and text scale, avoid nested bordered panels, and keep timeline copy compact
while retaining privacy and partial-result status. Dock reselect scrolls to top,
then returns to the default section; an already-top view skips the scroll step.
See the linked feature page for regression tests and intentional exceptions.


## State retention and host regressions

For the source-linked diagnosis guide, read
`apps/docs/build/development-tools/mobile-state-regressions.mdx`.

- A covered editor must remove its captured owned route, not pop whichever route
  is currently on top. A post-frame callback on a settled UI needs
  `WidgetsBinding.instance.ensureVisualUpdate()` to schedule cleanup. Test that
  the old actor's editor disappears while an unrelated covering modal survives.
- Test a dock action through its real host and publisher when reachability matters.
  A manually mounted destination widget does not prove host admission. Separate
  review eligibility from mutation eligibility; Notes silence can be reviewed
  while Save remains disabled and no paid analysis is replayed.
- A successful read-through cached return is display data, not fresh permission
  proof for a second cache. Use the repository's explicit `requireFresh` path
  with awaited transport fallback disabled for authorization-sensitive publication,
  retaining actor/workspace/request and denial-revision fences.
- For endpoints with MFA challenges, recognize both the typed verification flag
  and `code == 'MFA_REQUIRED'`. Preserve the scoped snapshot and visible challenge,
  while definitive denials still clear it. Retention does not bypass mutation
  authorization.
- Attach handlers to independent startup futures together before awaiting either.
  Default settle-all `Future.wait` handles a sibling failure while another task
  remains pending; connect only after all prerequisites succeed and scope is
  still current. Test pending and failing tasks with controlled completers.
- Keep shell provider mocks faithful to consumed getters, including an explicit
  `AuthCubit.isClosed` value. Preserve page-build, navigation and geometry
  assertions. Auth transition fixtures assert immediate revocation and await the
  source notification before expecting restored actor identity; see the
  [async fixture guidance](../../../../../apps/docs/build/development-tools/mobile-state-regressions.mdx#keep-asynchronous-assistant-fixtures-in-their-owning-zone).

- Separate foreground interaction admission from the lease of an already admitted
  remote operation. A transient local runtime invalidation on pause must not drop
  remote chunks, errors, or completion. Keep sticky actor/workspace and semantic
  mode-selection epochs; runtime hydration may block new actions without
  cancelling an existing remote reply. Test through the actual page and dock,
  including paused completion/error, active resume, and ABA transitions. In widget
  fixtures, supply native platform boundaries explicitly and pump stream closure
  before awaiting fake-async completion.

Keep runtime claims separate: source and injected-host tests do not establish
provider/device operation or production delivery.

- **Continuous Calendar Geometry**: Keep fractional movement during active horizontal drags, then use day-width ballistic snapping on synchronized header, all-day and timed-grid surfaces. Preserve the buffered date window/recenter and loaded cache. Partition timed layout into connected half-open overlap components so isolated groups regain full column width; anchor all-day label content inside the viewport intersection of its span, with fixed gutter clearance and text-scaled rows. Regress actual gestures on every surface, explicit date navigation, clipping boundaries and large text; widget results are not native-device proof.

- After awaiting cancellation to replace a remote reply, report acceptance using
  the durable operation lease. Composer cleanup must recheck that lease and its
  attachment revision and clear only unchanged captured text. Test real deferred
  cancellation, pause, newer edits, and actor/mode refusal. Dock fixtures must
  wait for hit-testable controls after retained outgoing action transitions; use
  legal inactive/hidden/paused/resume lifecycle sequences when global cache
  listeners are present.

- Native choosers launched by a conditional error alert must capture a stable
  screen-owned context. Clearing the alert can unmount its own context before
  source, file or crop awaits complete. Regress with a held chooser, pump the
  alert removal, then release a non-null source/file/crop and verify the write;
  cancellation-only fixtures do not prove recovery. Surface scoped upload
  failures at the active controls from current state so superseded operations
  cannot report a newer operation's failure.

- **Assistant settings gutters**: Keep embedded live preferences and local-model sections aligned with personal settings at 16px horizontal padding. Preserve standalone sheet padding. Reuse SettingsRouteFrame for the existing branded title and physical safe area; Assistant hub/field/prompt editors opt into its existing CustomNavigationBar/PersistentShellDock Back surface. Keep other consumers unchanged; do not add feature chrome. The settings layout matrix covers 320/390/430px and 1x/2x text plus final-control scroll clearance; widget geometry does not prove an authenticated installed artifact.

## Profile image uploads

Use `core/media/profile_media_optimizer.dart` for selections and offline replay.
Keep picker dimensions/quality and the native JPEG crop contract: the iOS picker
converts HEIC through its native image decoder before Dart decoding. Test native
options separately from real-device HEIC acceptance. Do not encode opaque phone
photos as lossless PNG; preserve recommended resolution with bounded JPEG quality
steps before reducing dimensions. Keep orientation and metadata regression checks.

For a 413, trace the real request from `apps/web/src/proxy.ts` through
`guardApiProxyRequest` before changing route limits: its default body ceiling can
reject bytes before the profile handler. Profile-specific proxy limits must match
storage-core's server caps for exact PUT paths while retaining streamed-byte,
authentication, one-use ticket, budget and server re-encoding enforcement. See
`@tuturuuu/storage-core/profile-upload-limits` for pure proxy-safe metadata;
keep server-only budget imports in handlers. Verify the native bridge proxy
suite without a `server-only` mock when changing this import chain. See
`apps/web/src/lib/profile-media-proxy.test.ts` and the user-management feature
page for recommended dimensions and current limits.

## Profile avatar removal

Capture `ProfilePickerIntent` before opening the removal confirmation and check
it after the sheet and mutation complete. It invalidates an account departure,
including a return to the original account. Keep avatar removal on
`removeAvatarResult` so actor-bound queue admission and API dispatch preserve
safe typed media failures. Reuse the existing EN/VI removal labels in recovery.
For bounded confirmation sheets, enable `AppDialogScaffold.scrollHeader` so a
scaled heading can scroll without hiding the fixed actions. The focused
`profile_avatar_removal_test.dart` and `profile_media_actor_race_test.dart`
exercise these boundaries; mock coverage does not qualify storage/device runtime.

### Local model preparation admission

Keep file integrity, preparation and actual inference evidence separate. The
store owns pinned length/digest checks; `assistant_model_preparation.dart` reads
only the 32-byte container prefix before the adapter calls native creation.
Keep Android admission at the pinned library's API 30 minimum, including
API 28/29 rejection and API 30 admission controls. Match the bundled native
reader's major-version admission, including same-major
minor/patch forward admission. Do not infer full FlatBuffer, backend or hardware
compatibility from the prefix. Native ABI/library failures get sanitized typed
recovery; opaque engine failures must not be labeled corruption or memory errors.

Run header, adapter configuration, preparation recovery, restart/reselection and
runtime tests through the canonical resource queue, then `bun check:mobile`.
Tiny synthetic headers and injected native errors prove admission/recovery only.
Real device installation/inference requires its own authorization and evidence;
never use download completion or mock readiness to close that gate.

- **Native Logo Parity**: Audit generated native PNG artwork bounds at each density rather than using padded generator image dimensions as visible logo size. App lock/loading share `AppSplashSurface`; preserve lock timers, controls and authentication boundaries when adjusting its visuals. Compare matching viewport/theme/text scale with `app_lock_splash_visual_test.dart`, and label reconstructed native canvases as source fixtures. Assert readable recovery text does not cross artwork at compact enlarged text; preserve entry centering and reserve top clearance when recovery needs the space. For Android assets run `dart run tool/generate_android_splash.dart` from `apps/mobile`: it directly copies canonical RGBA artwork into transparent padding and invokes Android-only splash generation without changing iOS or dependency files. Assert transparent corners, all canonical RGBA rows and 80dp artwork at every density for legacy/Android12. Inspect opaque padding separately; widget geometry and background checks do not prove full native raster parity or installed-device delivery.

### Assistant first-use settings and creation admission

Capture initial model, credit source, explicit nullable credit workspace and thinking
mode in one lifecycle-bound creation plan. Use the existing native creation
transaction and its bound full-tuple receipt; never initialize with an automatic
settings PATCH after creating the chat. Keep route view_chat and RPC create_chat
admission and manage_chat for later explicit edits. Credit scope must follow the
existing actor-personal/active-workspace billing rules, not arbitrary client IDs.
Do not substitute model defaults for a rejected explicit selection.

A source fixture passing is not atomic SQL proof: retain migration execution under
an admitted isolated exact-commit workflow as a separate gate. Malformed/stale or
unknown sent outcomes retain the original creation hold and draft. Regression
coverage and product scope live in apps/docs/platform/features/mobile-chat.mdx.

### Native Assistant uncertain-send reconciliation

Capture an immutable pending native turn by actor/workspace/chat before awaited
settings preparation, separate from its temporary completion waiter. Retain it
across late dispatch admission even when the selection has retired; release only
known pre-admission failures. Repeated Send of its
retained draft performs a fresh authorized receipt read, never a replacement POST
or generation retry. Validate request identity, sender, text and attachments; check
the captured generation before publishing. Missing/denied/malformed readback and
changed payloads remain held. A saved USER receipt does not certify model success.
After acknowledgment, equal-text follow-ups remain separate turns.

Normalize validated PostgreSQL timestamptz receipts at active API boundaries before
strict mobile parsers. Preserve microseconds separately from Date milliseconds and
validate calendar/offset/fraction before conversion. Cover actual creation and
message handlers plus JSON/NDJSON adapters, not only hand-authored ISO fixtures.
