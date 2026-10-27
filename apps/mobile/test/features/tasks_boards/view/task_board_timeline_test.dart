import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/helpers.dart';
import '../../../helpers/phone_surface.dart';
import 'task_board_row_actions_fixture.dart';

/// Serves [tasks] in the open Todo list, whatever the page size.
class _TimelineRepository extends RowActionsRepository {
  _TimelineRepository(this.tasks);

  final List<TaskBoardTask> tasks;

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async =>
      (await super.getTaskBoardDetail(wsId, boardId)).copyWith(tasks: tasks);

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async => offset > 0
      ? const <TaskBoardTask>[]
      : tasks.where((task) => task.listId == listId).toList();
}

DateTime _day(int offset) {
  final now = DateTime.now();
  return DateTime(now.year, now.month, now.day + offset, 12);
}

TaskBoardTask _task(String id, String name, {int? start, int? end}) =>
    TaskBoardTask(
      id: id,
      listId: 'list-1',
      name: name,
      priority: 'high',
      startDate: start == null ? null : _day(start),
      endDate: end == null ? null : _day(end),
    );

final List<TaskBoardTask> _standardTasks = [
  _task('task-1', 'Alpha task', end: 0),
  _task('task-overdue', 'Overdue task', end: -3),
  _task('task-ongoing', 'Ongoing task', start: -2, end: 3),
  _task('task-soon', 'Soon task', start: 2),
  _task('task-later', 'Later task', start: 12),
  _task('task-undated', 'Undated task'),
];

Finder _key(String key) => find.byKey(ValueKey(key));

Future<void> _pumpTimeline(
  WidgetTester tester,
  List<TaskBoardTask> tasks,
) async {
  await pumpRowActionsBoard(
    tester,
    workspaceCubit: rowActionsWorkspaceCubit(),
    repository: _TimelineRepository(tasks),
  );
  BlocProvider.of<TaskBoardDetailCubit>(
    tester.element(find.byType(Scrollable).first),
  ).setView(TaskBoardDetailView.timeline);
  await tester.pumpAndSettle();
}

void main() {
  group('board timeline agenda', () {
    usePhoneSurface();

    testWidgets('opens on today with overdue work above it', (tester) async {
      await _pumpTimeline(tester, _standardTasks);

      final todayHeader = find.textContaining('Today ·');
      expect(todayHeader, findsOneWidget);
      final scrollTop = tester.getTopLeft(find.byType(CustomScrollView)).dy;
      expect(tester.getTopLeft(todayHeader).dy - scrollTop, lessThan(48));
      expect(_key('task-timeline-row-task-1'), findsOneWidget);
      expect(find.textContaining('Day 3 of 6'), findsOneWidget);

      await tester.drag(find.byType(CustomScrollView), const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Overdue task'), findsOneWidget);
      expect(find.text('Overdue'), findsOneWidget);

      await tester.tap(_key('task-timeline-today-button'));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(todayHeader).dy - scrollTop, lessThan(48));
    });

    testWidgets('the range hides later work until Show later', (tester) async {
      await _pumpTimeline(tester, _standardTasks);

      await tester.tap(find.text('Week'));
      await tester.pumpAndSettle();
      expect(find.text('Later task'), findsNothing);
      await tester.scrollUntilVisible(_key('task-timeline-show-later'), 200);
      await tester.tap(_key('task-timeline-show-later'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.text('Later task'), 200);
      expect(find.text('Later task'), findsOneWidget);
      await tester.scrollUntilVisible(find.text('Undated task'), 200);
    });

    testWidgets('tapping a row opens the task quick actions', (tester) async {
      await _pumpTimeline(tester, _standardTasks);

      await tester.tap(_key('task-timeline-row-task-1'));
      await tester.pumpAndSettle();

      expect(find.text('Open full details'), findsWidgets);
    });

    testWidgets('builds only the rows near the viewport', (tester) async {
      final tasks = [
        for (var i = 0; i < 1500; i++)
          _task('bulk-$i', 'Bulk task $i', start: i % 60, end: i % 60 + 1),
      ];
      await _pumpTimeline(tester, [
        ...tasks,
        _task('task-1', 'Alpha task', end: 0),
      ]);

      final built = find.byType(AppGroupedRow, skipOffstage: false);
      expect(built.evaluate().length, lessThan(40));
      // Counts are gone: no "N tasks" chips or per-list totals.
      expect(find.textContaining(RegExp(r'\d+ tasks')), findsNothing);
    });

    testWidgets('a board with no dated or undated work shows one message', (
      tester,
    ) async {
      await _pumpTimeline(tester, [
        TaskBoardTask(
          id: 'task-1',
          listId: 'list-2',
          name: 'Alpha task',
          endDate: _day(1),
        ),
      ]);

      expect(find.byType(CustomScrollView), findsNothing);
      expect(find.byType(AppStateMessage), findsOneWidget);
    });
  });

  group('board timeline layout', () {
    usePhoneSurface(size: const Size(320, 568));

    testWidgets('fits a small phone at 2x text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await _pumpTimeline(tester, _standardTasks);

      expect(tester.takeException(), isNull);
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -600));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('board timeline renders', () {
    setUpAll(DesignRender.loadFonts);

    for (final MapEntry(key: name, value: (settings, brightness))
        in DesignRender.themes.entries) {
      testWidgets('phone $name', (tester) async {
        DesignRender.setSize(tester, DesignRender.sizes['phone']!);
        final workspaceCubit = rowActionsWorkspaceCubit();
        await tester.pumpWidget(
          RepaintBoundary(
            key: DesignRenderApp.boundaryKey,
            child: appearanceTestApp(
              appearance: settings,
              brightness: brightness,
              home: MultiBlocProvider(
                providers: [
                  BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
                  BlocProvider(create: (_) => ShellChromeActionsCubit()),
                ],
                child: TaskBoardDetailPage(
                  boardId: 'board-1',
                  taskRepository: _TimelineRepository(_standardTasks),
                ),
              ),
            ),
          ),
        );
        for (var i = 0; i < 3; i++) {
          await tester.pump(const Duration(milliseconds: 350));
        }
        await tester.pumpAndSettle();
        BlocProvider.of<TaskBoardDetailCubit>(
          tester.element(find.byType(Scrollable).first),
        ).setView(TaskBoardDetailView.timeline);
        await tester.pumpAndSettle();

        expect(find.textContaining('Today ·'), findsOneWidget);
        await DesignRender.capture(tester, 'task-timeline-phone-$name');
      });
    }
  });
}
