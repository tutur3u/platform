# AGENTS.md - Mobile Flutter/Dart Playbook

This file contains Flutter/Dart and mobile-app-specific rules for `apps/mobile`.
Global repo rules still apply from the root `AGENTS.md`.

## 1. Mandatory Actions

- **Localization Generation**: Run `flutter gen-l10n` after ARB changes.
- **Clean Pass**: `bun check:mobile` is mandatory for mobile changes. It runs format, analyze, and test.
- **Flutter L10n Asset Formatting**: Do not send `.arb` files through `dart format`; format only Dart sources and regenerate `flutter gen-l10n` after ARB edits.
- **Flutter Analyze Ignore Hygiene**: Avoid speculative `ignore_for_file` directives. `flutter analyze` reports `unnecessary_ignore` as a failing issue during `bun check:mobile`.

## 2. Engineering Standards

- **API Pattern**: Use `createClient(request)` in web API routes to support mobile Bearer token auth.
- **Widget Consistency**: Preserve per-field validation when refactoring into shared editable widgets.
- **Mobile API Error Surfacing**: In mobile form submit handlers, catch `ApiException` separately and surface `e.message` (with safe fallback) instead of only a generic toast.
- **Workspace-Scoped Async State**: In Flutter screens that can switch workspaces while showing workspace-owned collections, store the collection owner `wsId`, scope loading/loaded flags by workspace, and ignore stale async responses with a request token/version check.
- **Flutter Toast Overlay Context**: In `shadcn_flutter`, call `showToast` with a context captured from `Navigator.of(context, rootNavigator: true).context` before async gaps; when passed through a helper after `await`, add `if (!toastContext.mounted) return;` at the call site.
- **Async Cubit Emit After Dispose**: In stateful mobile pages that own cubits and kick off async loads during rebuilds or workspace switches, guard post-await emits with `isClosed` (or an equivalent helper) so route changes and tab switches cannot throw `Cannot emit new states after calling close`.
- **shadcn Drawer Dismissal Parity**: For overlays opened with `showAdaptiveDrawer`/`shad.openDrawer`, dismiss compact drawers with `shad.closeOverlay(context)` (or `Navigator.maybePop`) instead of `Navigator.pop` from drawer-local contexts.
- **Async Sheet Submit Discipline**: In create/edit bottom sheets and dialogs, await async submit mutations before `Navigator.pop`, keep a loading state on the primary action, and block dismissal while the mutation is running.
- **Flutter initState Inherited Access**: Do not read inherited values (for example `context.l10n`, `Theme.of`, `Localizations.of`) synchronously in helpers triggered from `initState`.

## 3. Mobile UX & Shell Patterns

- **Immersive Mobile View Transitions**: When toggling between fullscreen/immersive and overview modes, reset scroll position deliberately and recompute bottom insets for restored nav/FAB chrome.
- **Compact Shell Safe Areas**: Pages rendered inside `ShellPage` already sit under shell-managed app bar/footer chrome; avoid unconditional inner `SafeArea` top/bottom padding in feature pages.
- **Flutter Compact Test Viewports**: Validate new cards and hero surfaces against the app widget-test viewport, not only simulator screenshots.
- **shadcn Toast Timers in Widget Tests**: When tests trigger `shad.showToast`, drain the toast auto-close timer before teardown (for example `tester.drainShadToastTimers()` then settle) unless toast duration is explicitly overridden.
- **Global App Picker Semantics**: The global `Apps` tab should always behave as an app picker entry point, not as a proxy for the last selected mini-app.
- **Hybrid Shell Navigation Policy**: In `ShellPage`, use `context.go` for top-level shell roots (`/`, `/apps`, `/assistant`, and each mini-app root) and `context.push` for mini-app child routes (for example `/tasks/boards`, `/finance/wallets/:walletId`, `/timer/history`) so Android back preserves in-app history.
- **Shell Back Handler Deduplication**: If `ShellPage` uses both `BackButtonListener` and `PopScope`, guard against the same system-back gesture being handled twice. A duplicate `PopScope` callback after a handled `BackButtonListener` event can skip the intended `/apps` fallback and call `SystemNavigator.pop()` from a mini-app root.
- **Android Back Forwarding**: If Android hardware back backgrounds the activity without any Flutter `PopScope`/router callback, add a `MainActivity` `OnBackPressedDispatcher` callback that forwards to `flutterEngine.navigationChannel.popRoute()` and enable `android:enableOnBackInvokedCallback="true"` in the manifest.
- **Shell-Owned Mobile App Chrome**: When global bottom nav already provides route hierarchy and `Apps` returns to picker, do not add duplicate per-page back buttons in sub-app `AppBar`s.
- **Shared Flutter App Bars vs Test Providers**: Reusable mobile `AppBar`s that inject provider-dependent actions should gate those actions defensively or make them injectable for standalone tests.
- **ShellPage Widget Test Harness**: `ShellPage` tests must provide `AuthCubit` and `WorkspaceCubit` (the top bar avatar reads both) and should prefer compact test viewports plus bounded `pump` loops over `pumpAndSettle` to avoid hanging on persistent shell/nav animations.
- **Flutter Standalone Card Surfaces**: For tinted or pastel tappable cards, do not rely on `Ink` decoration without a clear `Material` ancestor.
- **Chat-First Mobile Assistant Layouts**: Keep assistant surfaces focused on transcript/composer; move secondary controls into modal settings/history surfaces.
- **Stable Shell Top Bars Across Tabs**: Keep shell navbar layout stable across Home, Assistant, and Apps; place assistant-only actions in the assistant surface.
- **Opt-In Mobile Fullscreen Chat**: Do not auto-enter fullscreen because the assistant tab opened or workspace reloaded.
- **Inline Mobile Streaming State**: Create/update the pending assistant message as soon as stream starts and keep streaming/thinking indicators inline with transcript.

## 4. Flutter Tooling & Platform Details

- **iOS Lockstep**: After bumping FlutterFire or other iOS-backed Flutter dependencies in `apps/mobile/pubspec.yaml` or `apps/mobile/pubspec.lock`, refresh and commit `apps/mobile/ios/Podfile.lock`.
- **iOS Podspec Snapshot Drift**: If dependency bumps change iOS plugin podspec constraints, run `flutter pub get`, then `cd apps/mobile/ios && pod update <affected pod/plugin>`, and commit the updated lockfile.
- **Latest image_cropper on Xcode 16 CI**: Keep latest `image_cropper`, but patch vendored `TOCropViewController.m` in `apps/mobile/ios/Podfile` `post_install` with `#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 260000` guard instead of downgrading.
- **Dart Part Imports**: For Dart `part` files, add library imports only in the parent file that declares `part ...`.
- **Flutter View File Splits**: When a Flutter page/view exceeds module boundary threshold, keep the entry file as library root and split into sibling `part` files by concern.
- **shadcn Flutter TextField API**: Use supported `TextField` props like `controller`, `hintText`, and `onChanged`; do not assume `placeholder`/`leading` props.
- **Flutter macOS Script Sandbox**: Keep `ENABLE_USER_SCRIPT_SANDBOXING = NO` in `apps/mobile/macos/Runner.xcodeproj/project.pbxproj` build configurations.
- **FlutterFire CLI in Apple Build Scripts**: For iOS/macOS Crashlytics upload phases generated by FlutterFire, guard scripts with `command -v flutterfire` (or equivalent) so CI does not require a globally installed `flutterfire` binary.

## 5. Maintainability

- **Module Boundaries**: When a file grows beyond roughly 500 LOC, split it by concern and keep the original entrypoint as a thin barrel re-export so dispatcher imports remain stable.
