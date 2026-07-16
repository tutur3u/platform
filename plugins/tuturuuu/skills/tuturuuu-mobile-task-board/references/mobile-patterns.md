# Mobile Patterns

Load this reference for `apps/mobile` task-board, finance, overlay, shell, or
localization changes.

## Verification And Localization

- After adding or renaming Flutter ARB keys, run `flutter gen-l10n` before
  `flutter analyze` or tests. Generated localization files are tracked.
- Use Dart formatting or `bun check:mobile` for Dart files. `bun ff` does not
  format Dart and may fail with "No files were processed."
- Do not manually bump `apps/mobile/pubspec.yaml` for ordinary authored mobile
  behavior changes. Release Please owns mobile version updates.
- Keep `mobile-build-ios.yaml` on CocoaPods by disabling Flutter Swift Package
  Manager in CI while `image_cropper` and `dkimagepickercontroller` resolve
  incompatible `TOCropViewController` Swift package ranges.
- Keep `connectivity_plus` pinned to `7.0.0` and `device_info_plus` pinned to
  `12.3.0` while mobile iOS/macOS CI uses Xcode 16.4. `connectivity_plus`
  `7.1.1` references `NWPath.isUltraConstrained`, and `device_info_plus`
  `12.4.0` references `NSProcessInfo.isiOSAppOnVision`; that SDK does not
  provide those symbols, so root `bun check` enforces these pins with
  `scripts/check-mobile-dependencies.js`.
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

## Overlays And Shell

- Do not call `shad.openDrawer`, `shad.showDialog` for full-screen content, or
  `shad.showDropdown` for filter/picker content directly.
- Use `showAdaptiveDrawer` or `showAdaptiveSheet` so compact and expanded
  overlays share the Android-back-button dismissal behavior.
- Shell actions should open overlays immediately and let overlay content fetch
  or refresh on mount instead of blocking the tap on pre-open network work.
- Full-surface loaders should use `NovaLoadingIndicator`; native/spinner
  variants are for compact inline affordances.

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
