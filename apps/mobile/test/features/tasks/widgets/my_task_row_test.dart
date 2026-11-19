import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/tasks/utils/task_board_navigation.dart';
import 'package:mobile/features/tasks/widgets/my_task_row.dart';
import 'package:mobile/l10n/l10n.dart';

void main() {
  group('MyTaskRow', () {
    testWidgets('opens the owning board detail with taskId query', (
      tester,
    ) async {
      const task = UserTask(
        id: 'task-1',
        name: 'Refresh dashboard',
        priority: 'high',
        listId: 'list-1',
        list: TaskListInfo(
          id: 'list-1',
          name: 'In Progress',
          status: 'active',
          board: TaskBoardInfo(
            id: 'board-1',
            name: 'Product',
            wsId: 'ws-1',
            workspace: TaskWorkspaceInfo(id: 'ws-1', name: 'Workspace'),
          ),
        ),
      );

      final router = GoRouter(
        initialLocation: Routes.tasks,
        routes: [
          GoRoute(
            path: Routes.tasks,
            builder: (context, state) => Material(
              child: Center(
                child: MyTaskRow(
                  task: task,
                  workspaceId: 'ws-1',
                  now: DateTime(2026),
                  completed: false,
                  onOpen: () => openUserTaskBoardDetail(context, task),
                  onComplete: () async {},
                  onSnooze: () async {},
                ),
              ),
            ),
          ),
          GoRoute(
            path: Routes.taskBoardDetail,
            builder: (context, state) => Text(
              'board:${state.pathParameters['boardId']}'
              ' task:${state.uri.queryParameters['taskId']}',
            ),
          ),
        ],
      );
      addTearDown(router.dispose);

      await tester.pumpWidget(
        MaterialApp.router(
          localizationsDelegates: AppLocalizations.localizationsDelegates,
          supportedLocales: AppLocalizations.supportedLocales,
          routerConfig: router,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.text('Refresh dashboard'));
      await tester.pumpAndSettle();

      expect(
        router.routeInformationProvider.value.uri.toString(),
        '${Routes.taskBoardDetailPath('board-1')}?taskId=task-1',
      );
      expect(find.text('board:board-1 task:task-1'), findsOneWidget);
    });
  });
}
