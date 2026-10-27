import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/helpers.dart';
import '../../../helpers/phone_surface.dart';
import 'task_board_row_actions_fixture.dart';

/// Serves [tasks] in the open Todo list only through list pages, as the API
/// does, page by page as the app asks.
class _TimelineRepository extends RowActionsRepository {
  _TimelineRepository(this.tasks, {this.holdAfterFirstPage = false});

  final List<TaskBoardTask> tasks;

  /// When set, every page after the first never completes.
  final bool holdAfterFirstPage;
  final List<({int limit, int offset})> pages = [];

  /// How many pages the List view had fetched before the Timeline opened.
  int pagesBeforeTimeline = 0;

  @override
  Future<TaskBoardDetail> getTaskBoardDetail(
    String wsId,
    String boardId,
  ) async =>
      (await super.getTaskBoardDetail(wsId, boardId)).copyWith(tasks: const []);

  @override
  Future<List<TaskBoardTask>> getBoardTasksForList(
    String wsId, {
    required String listId,
    int limit = 50,
    int offset = 0,
    List<WorkspaceUserOption> members = const <WorkspaceUserOption>[],
    List<TaskLabel> labels = const <TaskLabel>[],
    List<TaskProjectSummary> projects = const <TaskProjectSummary>[],
  }) async {
    pages.add((limit: limit, offset: offset));
    if (holdAfterFirstPage && offset > 0) {
      return await Completer<List<TaskBoardTask>>().future;
    }
    return tasks
        .where((task) => task.listId == listId)
        .skip(offset)
        .take(limit)
        .toList();
  }
}

class _Timezone extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

/// A zone whose calendar day differs from the device's right now, so any
/// device-clock shortcut lands on the wrong day.
String _zoneOnAnotherDay() {
  final now = DateTime.now();
  final device = DateTime(now.year, now.month, now.day);
  return [
    'Pacific/Kiritimati',
    'Pacific/Pago_Pago',
  ].firstWhere((zone) => taskDay(now, zone) != device);
}

/// Noon of the day [offset] days from today in [zone].
DateTime _zoneDayAt(String zone, int offset) {
  final today = taskDay(DateTime.now(), zone);
  return tz.TZDateTime(
    timezoneLocation(zone),
    today.year,
    today.month,
    today.day + offset,
    12,
  );
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

Future<_TimelineRepository> _pumpTimeline(
  WidgetTester tester,
  List<TaskBoardTask> tasks, {
  bool holdAfterFirstPage = false,
}) async {
  final repository = _TimelineRepository(
    tasks,
    holdAfterFirstPage: holdAfterFirstPage,
  );
  await pumpRowActionsBoard(
    tester,
    workspaceCubit: rowActionsWorkspaceCubit(),
    repository: repository,
  );
  repository.pagesBeforeTimeline = repository.pages.length;
  BlocProvider.of<TaskBoardDetailCubit>(
    tester.element(find.byType(Scrollable).first),
  ).setView(TaskBoardDetailView.timeline);
  if (holdAfterFirstPage) {
    // A held page keeps the loading indicator animating.
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
  } else {
    await tester.pumpAndSettle();
  }
  return repository;
}

void main() {
  group('board timeline agenda', () {
    usePhoneSurface();

    testWidgets('opens on today with overdue work above it', (tester) async {
      await _pumpTimeline(tester, _standardTasks);

      final todayHeader = find.textContaining('Today ·');
      expect(todayHeader, findsOneWidget);
      final scrollTop = tester.getTopLeft(find.byType(CustomScrollView)).dy;
      expect(tester.getTopLeft(todayHeader).dy - scrollTop, lessThan(120));
      expect(_key('task-timeline-row-task-1'), findsOneWidget);
      expect(find.textContaining('Day 3 of 6'), findsOneWidget);

      await tester.drag(find.byType(CustomScrollView), const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Overdue task'), findsOneWidget);
      expect(find.text('Overdue'), findsOneWidget);

      await tester.tap(_key('task-timeline-today-button'));
      await tester.pumpAndSettle();
      expect(tester.getTopLeft(todayHeader).dy - scrollTop, lessThan(120));
    });

    testWidgets('loads every page without scrolling and places page five', (
      tester,
    ) async {
      final repository = await _pumpTimeline(tester, [
        for (var i = 0; i < 449; i++)
          _task('bulk-$i', 'Bulk task $i', start: 5, end: 6),
        _task('task-today', 'Due today task', end: 0),
      ]);

      // No drag or fling happened: the Timeline paged on its own. The
      // today task is task 450, on page five at 100 per page; first-page
      // loading would leave Today empty.
      final timelinePages = repository.pages.skip(
        repository.pagesBeforeTimeline,
      );
      expect(timelinePages, isNotEmpty);
      expect(timelinePages.every((page) => page.limit == 100), isTrue);
      expect(repository.pages.last.offset, greaterThanOrEqualTo(400));
      expect(_key('task-timeline-row-task-today'), findsOneWidget);
      expect(_key('task-timeline-nothing-today'), findsNothing);
      expect(_key('task-timeline-today-loading'), findsNothing);
    });

    testWidgets('never claims nothing today while pages remain', (
      tester,
    ) async {
      await _pumpTimeline(tester, [
        for (var i = 0; i < 150; i++)
          _task('bulk-$i', 'Bulk task $i', start: 3),
        _task('task-today', 'Due today task', end: 0),
      ], holdAfterFirstPage: true);

      expect(_key('task-timeline-nothing-today'), findsNothing);
      expect(_key('task-timeline-today-loading'), findsOneWidget);
      expect(find.text('Loading tasks…'), findsOneWidget);
    });

    testWidgets('a start-only task is ongoing, never overdue', (tester) async {
      await _pumpTimeline(tester, [
        _task('task-1', 'Alpha task', end: 0),
        _task('task-started', 'Started task', start: -5),
      ]);

      expect(find.textContaining('Started'), findsWidgets);
      expect(_key('task-timeline-row-task-started'), findsOneWidget);
      expect(_key('task-timeline-show-overdue'), findsNothing);
      expect(find.text('Overdue'), findsNothing);
    });

    testWidgets('Show overdue jumps to the overdue days', (tester) async {
      await _pumpTimeline(tester, _standardTasks);

      expect(find.text('Overdue task'), findsNothing);
      await tester.tap(_key('task-timeline-show-overdue'));
      await tester.pumpAndSettle();
      expect(find.text('Overdue task'), findsOneWidget);
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

  group('board timeline in the timezone setting', () {
    usePhoneSurface();

    testWidgets('labels today and the span day in the setting zone', (
      tester,
    ) async {
      final zone = _zoneOnAnotherDay();
      final timezone = _Timezone();
      whenListen(
        timezone,
        const Stream<TimezoneSettingsState>.empty(),
        initialState: TimezoneSettingsState(
          personal: zone,
          loading: false,
          resolved: true,
        ),
      );
      TaskBoardTask task(String id, String name, {int? start, int? end}) =>
          TaskBoardTask(
            id: id,
            listId: 'list-1',
            name: name,
            priority: 'high',
            startDate: start == null ? null : _zoneDayAt(zone, start),
            endDate: end == null ? null : _zoneDayAt(zone, end),
          );
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<WorkspaceCubit>.value(
              value: rowActionsWorkspaceCubit(),
            ),
            BlocProvider<TimezoneSettingsCubit>.value(value: timezone),
            BlocProvider(create: (_) => ShellChromeActionsCubit()),
          ],
          child: TaskBoardDetailPage(
            boardId: 'board-1',
            taskRepository: _TimelineRepository([
              task('task-1', 'Alpha task', end: 0),
              task('task-ongoing', 'Ongoing task', start: -2, end: 3),
              task('task-soon', 'Soon task', start: 1),
            ]),
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

      final zoneToday = taskDay(DateTime.now(), zone);
      final date = DateFormat.MMMEd('en');
      final todayHeader = find.text('Today · ${date.format(zoneToday)}');
      expect(todayHeader, findsOneWidget);
      expect(find.textContaining('Today ·'), findsOneWidget);
      final zoneTomorrow = DateTime(
        zoneToday.year,
        zoneToday.month,
        zoneToday.day + 1,
      );
      expect(
        find.text('Tomorrow · ${date.format(zoneTomorrow)}'),
        findsOneWidget,
      );
      // Today's group holds the task due today, below its header.
      expect(
        tester.getTopLeft(_key('task-timeline-row-task-1')).dy,
        greaterThan(tester.getTopLeft(todayHeader).dy),
      );
      expect(find.textContaining('Day 3 of 6'), findsOneWidget);
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
