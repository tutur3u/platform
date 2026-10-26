import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';

import 'task_board_row_actions_fixture.dart';

/// Records tracker starts; every other tracker call is unexpected here.
class _TimerRepository extends Fake implements ITimeTrackerRepository {
  _TimerRepository({this.running});

  final TimeTrackingSession? running;
  final List<({String wsId, String? title, String? taskId})> starts = [];

  @override
  Future<TimeTrackingSession?> getRunningSession(String wsId) async => running;

  @override
  Future<TimeTrackingSession> startSession(
    String wsId, {
    String? title,
    String? description,
    String? categoryId,
    String? taskId,
    String? userId,
    String? parentSessionId,
    bool wasResumed = false,
  }) async {
    starts.add((wsId: wsId, title: title, taskId: taskId));
    return TimeTrackingSession(id: 'session-new', title: title, taskId: taskId);
  }
}

void main() {
  late RowActionsWorkspaceCubit workspaceCubit;
  late RowActionsRepository repository;

  setUp(() {
    workspaceCubit = rowActionsWorkspaceCubit();
    repository = RowActionsRepository();
  });

  Future<void> pumpBoard(
    WidgetTester tester, {
    ITimeTrackerRepository? timer,
  }) => pumpRowActionsBoard(
    tester,
    workspaceCubit: workspaceCubit,
    repository: repository,
    timeTrackerRepository: timer,
  );

  Future<void> openMenu(WidgetTester tester, String title) async {
    await tester.longPress(find.text(title).first);
    await tester.pumpAndSettle();
  }

  group('mutation failures', () {
    testWidgets('a failed complete rolls the task back and shows the error', (
      tester,
    ) async {
      repository.moveError = const ApiException(
        message: 'Move rejected',
        statusCode: 409,
      );
      await pumpBoard(tester);

      await tester.drag(taskRow('Alpha task'), const Offset(300, 0));
      await tester.pumpAndSettle();

      expect(find.text('Move rejected'), findsOneWidget);
      expect(repository.moves, isEmpty);
      final task = readRowActionsCubit(
        tester,
      ).state.board!.tasks.firstWhere((task) => task.id == 'task-1');
      expect(task.listId, 'list-1');
      await drainToasts(tester);
    });

    testWidgets('a failed priority change keeps the old value and says so', (
      tester,
    ) async {
      repository.updateError = const ApiException(
        message: 'Priority rejected',
        statusCode: 403,
      );
      await pumpBoard(tester);

      await tester.drag(taskRow('Alpha task'), const Offset(-320, 0));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('task-row-swipe-priority')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('task-row-priority-high')));
      await tester.pumpAndSettle();

      expect(find.text('Priority rejected'), findsOneWidget);
      expect(find.text('Priority updated.'), findsNothing);
      final task = readRowActionsCubit(
        tester,
      ).state.board!.tasks.firstWhere((task) => task.id == 'task-1');
      expect(task.priority, isNull);
      await drainToasts(tester);
    });
  });

  testWidgets('Schedule saves the picked day at the end of that local day', (
    tester,
  ) async {
    await pumpBoard(tester);

    await tester.drag(taskRow('Alpha task'), const Offset(-320, 0));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('task-row-swipe-schedule')));
    await tester.pumpAndSettle();
    expect(find.byType(AppDatePicker), findsOneWidget);

    await tester.tap(find.widgetWithText(AppButton, '15'));
    await tester.pumpAndSettle();

    final now = DateTime.now();
    expect(repository.updates.single.taskId, 'task-1');
    expect(
      repository.updates.single.endDate,
      DateTime(now.year, now.month, 15, 23, 59, 59),
    );
    // The success toast follows cache invalidation, which does real I/O
    // that fake async never completes; the failure tests cover the toast.
  });

  group('Start focus', () {
    testWidgets('starts a tracking session linked to the task', (tester) async {
      final timer = _TimerRepository();
      await pumpBoard(tester, timer: timer);

      await openMenu(tester, 'Alpha task');
      await tester.tap(find.byKey(const ValueKey('task-row-menu-focus')));
      await tester.pumpAndSettle();

      expect(timer.starts, hasLength(1));
      expect(timer.starts.single.wsId, 'ws-1');
      expect(timer.starts.single.taskId, 'task-1');
      expect(timer.starts.single.title, 'Alpha task');
      expect(find.text('Timer started for this task.'), findsOneWidget);
      await drainToasts(tester);
    });

    testWidgets('asks before replacing a timer running for another task', (
      tester,
    ) async {
      final timer = _TimerRepository(
        running: const TimeTrackingSession(id: 'running', taskId: 'task-9'),
      );
      await pumpBoard(tester, timer: timer);

      await openMenu(tester, 'Alpha task');
      await tester.tap(find.byKey(const ValueKey('task-row-menu-focus')));
      await tester.pumpAndSettle();
      expect(find.text('Stop the running timer?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(timer.starts, isEmpty);

      await openMenu(tester, 'Alpha task');
      await tester.tap(find.byKey(const ValueKey('task-row-menu-focus')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Stop and start'));
      await tester.pumpAndSettle();
      expect(timer.starts.single.taskId, 'task-1');
      await drainToasts(tester);
    });

    testWidgets('keeps a timer already running for the same task', (
      tester,
    ) async {
      final timer = _TimerRepository(
        running: const TimeTrackingSession(id: 'running', taskId: 'task-1'),
      );
      await pumpBoard(tester, timer: timer);

      await openMenu(tester, 'Alpha task');
      await tester.tap(find.byKey(const ValueKey('task-row-menu-focus')));
      await tester.pumpAndSettle();

      expect(find.text('Stop the running timer?'), findsNothing);
      expect(timer.starts, isEmpty);
      expect(find.text('Timer started for this task.'), findsOneWidget);
      await drainToasts(tester);
    });
  });
}
