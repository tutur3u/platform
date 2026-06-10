---
name: tuturuuu-mobile-task-board
description: Tuturuuu Flutter mobile task-board workflow guidance. Use when Codex changes apps/mobile task board behavior, task detail routing, task dates, overdue labels, assignees, task description view/edit mode, task list refreshes, workspace-aware navigation, mobile BLoC/Cubit code, or release-please-managed mobile release metadata.
---

# Tuturuuu Mobile Task Board

## Start Here

Read `references/task-board-reference.md` before editing. It captures the known file map, UX semantics, and verification flow for this area.
Read `references/mobile-patterns.md` when the work needs the broader mobile
pattern catalog that was split out of root `AGENTS.md`.

If the user asks to commit mobile work, combine this skill with
`$tuturuuu-commit`. Keep a user-visible mobile behavior, its tests,
and localization together unless the user explicitly asks for a different split.
Do not manually bump `apps/mobile/pubspec.yaml` for ordinary authored work;
Release Please owns mobile version updates.

Search these files first, then expand only as needed:

- `apps/mobile/lib/features/tasks/presentation/cubit/task_board_detail_cubit.dart`
- `apps/mobile/lib/features/tasks/presentation/utils/task_board_navigation.dart`
- `apps/mobile/lib/features/tasks/presentation/views/task_board_detail_page_view.dart`
- `apps/mobile/lib/features/tasks/presentation/widgets/task_board_detail_page_actions.dart`
- `apps/mobile/pubspec.yaml`

## Behavioral Defaults

Preserve these user-visible defaults unless the user explicitly changes the product decision:

- Selected start dates default to `12 AM` at the start of the day.
- Selected end dates default to `11:59 PM` at the end of the day.
- A task should become overdue only after today's midnight has passed, meaning the next day.
- Task descriptions open in view mode. Enter edit mode only when the edit FAB is clicked.
- Hide task-detail shell chrome that competes with the task title area when the route/view pattern supports it.
- After task mutations, refresh the affected task list instead of relying only on a full board reload.

## Code Patterns

Keep navigation workspace-aware through `openUserTaskBoardDetailWithWorkspace(...)`. After any awaited workspace-switching work, guard navigation with a mounted check before using `context.go(...)`.

When changing assignee flows, sanitize stale or invalid assignee IDs before submitting mutation payloads. Bulk clear-assignee behavior should clear all selected assignees without leaving stale state in the payload.

When localization keys change under `apps/mobile/lib/l10n/arb/*.arb`, run `flutter gen-l10n` before analysis or tests because generated localization files are tracked.

## Verification

Prefer focused mobile tests first, then broader checks:

- Run the smallest relevant Flutter test target.
- If multiple Flutter tests conflict while writing `build/unit_test_assets`, rerun them sequentially.
- Run `flutter analyze` for mobile Dart changes when feasible.
- Run `dart format` on touched Dart files.
- Run `git diff --check` before finishing.
- For user-visible mobile changes, keep release-please-managed mobile version
  files untouched unless the user is explicitly handling a release branch.
