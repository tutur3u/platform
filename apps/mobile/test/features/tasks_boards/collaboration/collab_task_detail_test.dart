import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/board_share_sheet.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_activity_section.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_comments_section.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_links_section.dart';
import 'package:mobile/features/tasks_boards/collaboration/widgets/task_share_sheet.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';

import '../../../helpers/phone_surface.dart';
import '../view/task_board_quick_actions_fixture.dart';
import '../view/task_board_row_actions_fixture.dart';

void main() {
  late RowActionsWorkspaceCubit workspaceCubit;
  late QuickActionsRepository repository;

  setUp(() {
    workspaceCubit = rowActionsWorkspaceCubit();
    repository = QuickActionsRepository();
  });

  // A phone window: the dock owns Back, and the task opens as a sheet.
  usePhoneSurface();

  testWidgets('the task sheet offers sharing and the discussion', (
    tester,
  ) async {
    await openQuickActionsSheet(
      tester,
      workspaceCubit: workspaceCubit,
      repository: repository,
      showProperties: false,
    );

    final share = find.byKey(const ValueKey('task-detail-share'));
    final discussion = find.byKey(const ValueKey('task-detail-discussion'));
    await tester.ensureVisible(share);
    expect(share, findsOneWidget);
    expect(discussion, findsOneWidget);
    // The quick sheet reads no comments, links or activity itself.
    expect(find.byType(TaskCommentsSection), findsNothing);

    await tester.tap(share);
    await tester.pumpAndSettle();
    expect(find.byType(TaskShareSheet), findsOneWidget);
  });

  testWidgets('the discussion row opens the detail screen sections', (
    tester,
  ) async {
    await openQuickActionsSheet(
      tester,
      workspaceCubit: workspaceCubit,
      repository: repository,
      showProperties: false,
    );

    final discussion = find.byKey(const ValueKey('task-detail-discussion'));
    await tester.ensureVisible(discussion);
    await tester.tap(discussion);
    // The sections start loading from the server; a bounded pump shows them
    // without waiting on the requests.
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));

    expect(find.byType(TaskCommentsSection), findsOneWidget);
    expect(find.byType(TaskLinksSection), findsOneWidget);
    expect(find.byType(TaskActivitySection), findsOneWidget);
  });

  testWidgets('the board menu shares the board', (tester) async {
    await pumpRowActionsBoard(
      tester,
      workspaceCubit: workspaceCubit,
      repository: repository,
    );
    final chrome = tester
        .element(find.byType(TaskBoardDetailPage))
        .read<ShellChromeActionsCubit>();
    chrome.state.registrations.values
        .expand((registration) => registration.actions)
        .firstWhere((action) => action.id == 'task-board-detail-actions')
        .onPressed!();
    await tester.pumpAndSettle();

    await tester.tap(find.byKey(const ValueKey('board-action-share')));
    await tester.pumpAndSettle();
    expect(find.byType(BoardShareSheet), findsOneWidget);
  });
}
