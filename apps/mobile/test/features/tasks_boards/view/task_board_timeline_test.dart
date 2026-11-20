import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/utils/timezone_location.dart';
import 'package:mobile/data/models/task_board_detail.dart';
import 'package:mobile/data/models/task_board_task.dart';
import 'package:mobile/data/models/task_label.dart';
import 'package:mobile/data/models/task_project_summary.dart';
import 'package:mobile/data/models/workspace_user_option.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/tasks_boards/cubit/task_board_detail_cubit.dart';
import 'package:mobile/features/tasks_boards/utils/task_due_dates.dart';
import 'package:mobile/features/tasks_boards/view/task_board_detail_page.dart';
import 'package:mobile/features/tasks_boards/widgets/timeline/task_timeline_rows.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:timezone/timezone.dart' as tz;

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/helpers.dart';
import '../../../helpers/phone_surface.dart';
import 'task_board_row_actions_fixture.dart';

/// Serves [tasks] in the open Todo list only through list pages, as the API
/// does, page by page as the app asks.
class _TimelineRepository extends RowActionsRepository {
  _TimelineRepository(
    this.tasks, {
    this.holdAfterFirstPage = false,
    this.failAtOffset,
  });

  final List<TaskBoardTask> tasks;
  int? failAtOffset;

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
    if (listId == 'list-1' && failAtOffset != null && offset >= failAtOffset!) {
      throw Exception('Page unavailable');
    }
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
  _task('task-undated', 'Undated task'),
];

Finder _key(String key) => find.byKey(ValueKey(key));

Future<_TimelineRepository> _pumpTimeline(
  WidgetTester tester,
  List<TaskBoardTask> tasks, {
  bool holdAfterFirstPage = false,
  int? failAtOffset,
}) async {
  final repository = _TimelineRepository(
    tasks,
    holdAfterFirstPage: holdAfterFirstPage,
    failAtOffset: failAtOffset,
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

String _dayKey(DateTime day) =>
    'task-timeline-day-${DateFormat('yyyy-MM-dd').format(day)}';

void main() {
  group('board timeline page', () {
    usePhoneSurface();

    testWidgets('opens on this week with overdue work first', (tester) async {
      await _pumpTimeline(tester, _standardTasks);

      final today = taskDay(DateTime.now(), null);
      expect(_key(_dayKey(today)), findsOneWidget);
      expect(find.text('Overdue 1'), findsOneWidget);
      expect(find.text('3d'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Overdue task')).dy,
        lessThan(tester.getTopLeft(find.text('Alpha task')).dy),
      );
      expect(_key('task-timeline-today-button'), findsNothing);
    });

    testWidgets('loads every page without scrolling and places page five', (
      tester,
    ) async {
      final repository = await _pumpTimeline(tester, [
        for (var i = 0; i < 449; i++)
          _task('bulk-$i', 'Bulk task $i', start: 40, end: 41),
        _task('task-today', 'Due today task', end: 0),
      ]);

      // No drag or fling happened: the Timeline paged on its own. The
      // today task is task 450, on page five at 100 per page.
      final timelinePages = repository.pages.skip(
        repository.pagesBeforeTimeline,
      );
      expect(timelinePages, isNotEmpty);
      expect(timelinePages.every((page) => page.limit == 100), isTrue);
      expect(repository.pages.last.offset, greaterThanOrEqualTo(400));
      expect(_key('task-timeline-row-task-today'), findsOneWidget);
      expect(_key('task-timeline-empty'), findsNothing);
    });

    testWidgets('never claims an empty week while pages remain', (
      tester,
    ) async {
      await _pumpTimeline(tester, [
        for (var i = 0; i < 150; i++)
          _task('bulk-$i', 'Bulk task $i', start: 40),
        _task('task-today', 'Due today task', end: 0),
      ], holdAfterFirstPage: true);

      expect(_key('task-timeline-empty'), findsNothing);
      expect(find.byType(AppLoadingIndicator), findsWidgets);
    });

    for (final offset in [0, 50]) {
      testWidgets('failed page at $offset stays incomplete and retries', (
        tester,
      ) async {
        final repository = await _pumpTimeline(tester, [
          for (var i = 0; i < 150; i++)
            _task('bulk-$i', 'Bulk task $i', start: 40),
          _task('task-today', 'Due today task', end: 0),
        ], failAtOffset: offset);
        expect(find.text('Something went wrong'), findsWidgets);
        expect(_key('task-timeline-retry'), findsOneWidget);
        final attempts = repository.pages.length;
        await tester.pump(const Duration(seconds: 1));
        expect(repository.pages.length, attempts);
        repository.failAtOffset = null;
        await tester.tap(_key('task-timeline-retry'));
        await tester.pumpAndSettle();
        expect(_key('task-timeline-row-task-today'), findsOneWidget);
        expect(_key('task-timeline-retry'), findsNothing);
      });
    }

    testWidgets('tapping a task opens its details', (tester) async {
      await _pumpTimeline(tester, _standardTasks);

      await tester.tap(_key('task-timeline-row-task-1'));
      await tester.pumpAndSettle();

      expect(find.byTooltip('Open full details'), findsWidgets);
    });

    testWidgets('a failed reschedule shows the shared task toast', (
      tester,
    ) async {
      final repository = await _pumpTimeline(tester, _standardTasks);
      repository.updateError = const ApiException(
        message: 'Could not update dates',
        statusCode: 500,
      );
      final row = _key('task-timeline-row-task-1');
      final gesture = await tester.startGesture(tester.getCenter(row));
      await tester.pump(const Duration(milliseconds: 600));
      await gesture.moveBy(const Offset(52, 0));
      await gesture.up();
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('app-toast')), findsOneWidget);
      expect(find.text("Couldn't move the task. Try again."), findsOneWidget);
      expect(find.text('Something went wrong'), findsNothing);
      await tester.pump(const Duration(seconds: 4));
      await tester.pumpAndSettle();
    });

    testWidgets('builds only the rows near the viewport', (tester) async {
      await _pumpTimeline(tester, [
        for (var i = 0; i < 1500; i++)
          _task('bulk-$i', 'Bulk task $i', start: 0, end: i % 3),
      ]);

      final built = find.byType(TaskTimelineBarRow, skipOffstage: false);
      expect(built, findsWidgets);
      expect(built.evaluate().length, lessThan(40));
    });

    testWidgets('the undated shortcut opens the list filtered to them', (
      tester,
    ) async {
      await _pumpTimeline(tester, [
        _task('task-1', 'Alpha task'),
        _task('task-2', 'Beta task'),
      ]);

      expect(find.text('Nothing scheduled this week'), findsOneWidget);
      await tester.tap(find.text('2 tasks without dates'));
      await tester.pumpAndSettle();

      final cubit = readRowActionsCubit(tester);
      expect(cubit.state.currentView, TaskBoardDetailView.list);
      expect(cubit.state.filters.undatedOnly, isTrue);
      expect(find.text('Alpha task'), findsOneWidget);
    });

    testWidgets('body scrolling reaches the shell for its hairline and dock', (
      tester,
    ) async {
      final escaped = <ScrollNotification>[];
      final repository = _TimelineRepository([
        for (var i = 0; i < 40; i++) _task('bulk-$i', 'Bulk task $i', end: 0),
      ]);
      await tester.pumpApp(
        NotificationListener<ScrollNotification>(
          onNotification: (notification) {
            escaped.add(notification);
            return false;
          },
          child: MultiBlocProvider(
            providers: [
              BlocProvider<WorkspaceCubit>.value(
                value: rowActionsWorkspaceCubit(),
              ),
              BlocProvider(create: (_) => ShellChromeActionsCubit()),
            ],
            child: TaskBoardDetailPage(
              boardId: 'board-1',
              taskRepository: repository,
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
      escaped.clear();

      await tester.drag(_key('task-timeline-body'), const Offset(0, -300));
      await tester.pumpAndSettle();
      expect(
        escaped.where(
          (n) => n is ScrollUpdateNotification && n.dragDetails != null,
        ),
        isNotEmpty,
      );
    });
  });

  group('board timeline in the timezone setting', () {
    usePhoneSurface();

    testWidgets('marks today and places bars in the setting zone', (
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
      await pumpRowActionsBoard(
        tester,
        workspaceCubit: rowActionsWorkspaceCubit(),
        repository: _TimelineRepository([
          TaskBoardTask(
            id: 'task-1',
            listId: 'list-1',
            name: 'Alpha task',
            endDate: _zoneDayAt(zone, 0),
          ),
        ]),
        timezone: timezone,
      );
      readRowActionsCubit(tester).setView(TaskBoardDetailView.timeline);
      await tester.pumpAndSettle();

      final zoneToday = taskDay(DateTime.now(), zone);
      final cell = tester.getRect(_key(_dayKey(zoneToday)));
      final bar = tester.getRect(_key('task-timeline-bar-task-1'));
      expect(bar.left, moreOrLessEquals(cell.left + 1, epsilon: 0.5));
      expect(bar.right, moreOrLessEquals(cell.right - 1, epsilon: 0.5));
      expect(find.textContaining(RegExp(r'^\dd$')), findsNothing);
    });
  });

  group('board timeline layout', () {
    usePhoneSurface(size: const Size(320, 568));

    testWidgets('fits a small phone at 2x text', (tester) async {
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await _pumpTimeline(tester, _standardTasks);

      expect(tester.takeException(), isNull);
      await tester.drag(_key('task-timeline-body'), const Offset(0, -600));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    });
  });

  group('board timeline renders', () {
    setUpAll(DesignRender.loadFonts);

    for (final MapEntry(key: name, value: (settings, brightness))
        in DesignRender.themes.entries) {
      for (final MapEntry(key: device, value: size) in {
        'phone': DesignRender.sizes['phone']!,
        'tablet': const Size(834, 1194),
      }.entries) {
        testWidgets('$device $name', (tester) async {
          DesignRender.setSize(tester, size);
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
          final cubit = readRowActionsCubit(tester)
            ..setView(TaskBoardDetailView.list);
          await tester.pumpAndSettle();
          expect(find.text('Alpha task'), findsOneWidget);
          await DesignRender.capture(tester, 'task-list-$device-$name');

          cubit.setView(TaskBoardDetailView.timeline);
          await tester.pumpAndSettle();
          expect(_key('task-timeline-header'), findsOneWidget);
          await tester.tap(find.text('Month'));
          await tester.pumpAndSettle();
          expect(_key('task-timeline-horizontal-viewport'), findsOneWidget);
          expect(tester.takeException(), isNull);
          await DesignRender.capture(
            tester,
            'task-timeline-month-$device-$name',
          );
        });
      }
    }
  });
}
