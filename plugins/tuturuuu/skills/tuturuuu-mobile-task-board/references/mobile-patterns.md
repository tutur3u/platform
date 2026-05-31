# Mobile Patterns

Load this reference for `apps/mobile` task-board, finance, overlay, shell, or
localization changes.

## Verification And Localization

- After adding or renaming Flutter ARB keys, run `flutter gen-l10n` before
  `flutter analyze` or tests. Generated localization files are tracked.
- Use Dart formatting or `bun check:mobile` for Dart files. `bun ff` does not
  format Dart and may fail with "No files were processed."
- Check whether `apps/mobile/pubspec.yaml` needs a version bump for
  user-visible mobile behavior changes.
- Keep `mobile-build-ios.yaml` on CocoaPods by disabling Flutter Swift Package
  Manager in CI while `image_cropper` and `dkimagepickercontroller` resolve
  incompatible `TOCropViewController` Swift package ranges.

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
