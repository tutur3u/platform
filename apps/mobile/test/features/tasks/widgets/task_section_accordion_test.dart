import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/user_task.dart';
import 'package:mobile/features/tasks/widgets/task_section_accordion.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

void main() {
  group('TaskSectionAccordion', () {
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
            builder: (context, state) => shad.DrawerOverlay(
              child: TaskSectionAccordion(
                title: 'Assigned',
                subtitle: '1 task',
                icon: const Icon(Icons.assignment_outlined),
                accentColor: Colors.blue,
                tasks: const [task],
                isCollapsed: false,
                onToggle: () {},
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
        shad.ShadcnApp.router(
          theme: const shad.ThemeData(
            colorScheme: shad.ColorSchemes.lightZinc,
          ),
          darkTheme: const shad.ThemeData.dark(
            colorScheme: shad.ColorSchemes.darkZinc,
          ),
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            shad.ShadcnLocalizations.delegate,
          ],
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
