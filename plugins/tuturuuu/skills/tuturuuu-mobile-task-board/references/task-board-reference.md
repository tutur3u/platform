# Mobile Task Board Reference

This reference is for `apps/mobile` task-board work in the Tuturuuu platform repo.

## File Map

- `task_board_detail_cubit.dart`: task detail state, mutation orchestration, refresh behavior.
- `task_board_navigation.dart`: task-board routing and workspace-aware detail navigation.
- `task_board_detail_page_view.dart`: detail page layout, description mode, shell chrome interactions.
- `task_board_detail_page_actions.dart`: task actions, edit affordances, and mutation triggers.
- `apps/mobile/lib/l10n/arb/*.arb`: mobile localizations.
- `apps/mobile/pubspec.yaml`: app version metadata.

## UX Semantics

- Start date selection should default to the start of day.
- End date selection should default to the end of day.
- Overdue labels should be based on whole-day semantics, not exact timestamp expiry during the selected end day.
- Description opens in view-first mode.
- Edit mode starts from explicit edit actions, usually the edit FAB.
- Task detail titles and back actions belong to the shell navbar. Register them there instead of adding a body AppBar/topbar or hiding the shell; scroll content consumes shell-provided dock clearance.

## Mutation And Refresh

- Refresh the affected list after task updates with force-refresh behavior where the surrounding cubit/repository pattern supports it.
- Avoid depending only on full board reloads for list-visible mutation feedback.
- Keep selected assignees valid for the target workspace and task context.
- Clear dependent task destination IDs immediately when their parent workspace or board changes.

## Routing

- Use the workspace-aware route boundary for opening task details across workspaces.
- After async workspace switching, check that the widget context is still mounted before navigation.
- Keep deep links and direct detail opens aligned with the same route helper.

## Verification

- Run focused Flutter tests around the changed cubit/widget/route behavior.
- If tests contend on `build/unit_test_assets`, rerun them sequentially.
- Run `flutter gen-l10n` after ARB key changes.
- Run `flutter analyze` when Dart code changed.
- Run `dart format` on touched Dart files.
- Run `git diff --check`.
- Check whether a user-visible mobile change requires bumping `apps/mobile/pubspec.yaml`.
