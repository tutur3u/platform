import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';

import 'task_board_row_actions_fixture.dart';

/// Records tracker writes; every other tracker call is unexpected here.
class _TimerRepository extends Fake implements ITimeTrackerRepository {
  _TimerRepository({this.running, this.paused});

  final TimeTrackingSession? running;
  final TimeTrackingSession? paused;
  final List<({String wsId, String? title, String? taskId})> starts = [];
  final List<String> stops = [];
  final List<String> resumes = [];
  final List<String> pauses = [];

  /// When set, starting a session fails, and optionally so does resuming.
  bool failStart = false;
  bool failResume = false;

  /// Pauses that fail before one succeeds.
  int failPauses = 0;

  @override
  Future<TimeTrackingSession?> getRunningSession(String wsId) async => running;

  @override
  Future<TimeTrackingSession?> getPausedSession(String wsId) async => paused;

  @override
  Future<TimeTrackingSession> stopSession(String wsId, String sessionId) async {
    stops.add(sessionId);
    return TimeTrackingSession(id: sessionId);
  }

  @override
  Future<TimeTrackingSession> resumeSession(
    String wsId,
    String sessionId,
  ) async {
    if (failResume) throw Exception('offline');
    resumes.add(sessionId);
    return TimeTrackingSession(id: '$sessionId-resumed');
  }

  @override
  Future<TimeTrackingSession> pauseSession(
    String wsId,
    String sessionId, {
    String? breakTypeId,
    String? breakTypeName,
  }) async {
    pauses.add(sessionId);
    if (failPauses > 0) {
      failPauses--;
      throw Exception('offline');
    }
    return TimeTrackingSession(id: sessionId);
  }

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
    if (failStart) throw Exception('offline');
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

    testWidgets('ends a paused timer for another task only after asking', (
      tester,
    ) async {
      final timer = _TimerRepository(
        paused: const TimeTrackingSession(id: 'paused', taskId: 'task-9'),
      );
      await pumpBoard(tester, timer: timer);

      await openMenu(tester, 'Alpha task');
      await tester.tap(find.byKey(const ValueKey('task-row-menu-focus')));
      await tester.pumpAndSettle();
      expect(find.text('End the paused timer?'), findsOneWidget);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(timer.stops, isEmpty);
      expect(timer.starts, isEmpty);

      await openMenu(tester, 'Alpha task');
      await tester.tap(find.byKey(const ValueKey('task-row-menu-focus')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Stop and start'));
      await tester.pumpAndSettle();
      // Stopping closes the paused session's open break before the start.
      expect(timer.stops, ['paused']);
      expect(timer.starts.single.taskId, 'task-1');
      await drainToasts(tester);
    });

    Future<void> replacePaused(WidgetTester tester) async {
      await openMenu(tester, 'Alpha task');
      await tester.tap(find.byKey(const ValueKey('task-row-menu-focus')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Stop and start'));
      await tester.pumpAndSettle();
    }

    testWidgets('a failed start puts the paused timer back as it was', (
      tester,
    ) async {
      final timer = _TimerRepository(
        paused: const TimeTrackingSession(id: 'paused', taskId: 'task-9'),
      )..failStart = true;
      await pumpBoard(tester, timer: timer);

      await replacePaused(tester);

      expect(timer.stops, ['paused']);
      expect(timer.resumes, ['paused']);
      expect(timer.pauses, ['paused-resumed']);
      expect(
        find.text("Couldn't start focus. Your paused timer is back as it was."),
        findsOneWidget,
      );
      await drainToasts(tester);
    });

    testWidgets('retries the re-pause once before giving up', (tester) async {
      final timer =
          _TimerRepository(
              paused: const TimeTrackingSession(id: 'paused', taskId: 'task-9'),
            )
            ..failStart = true
            ..failPauses = 1;
      await pumpBoard(tester, timer: timer);

      await replacePaused(tester);

      expect(timer.pauses, ['paused-resumed', 'paused-resumed']);
      expect(
        find.text("Couldn't start focus. Your paused timer is back as it was."),
        findsOneWidget,
      );
      await drainToasts(tester);
    });

    testWidgets('says the timer is running when it cannot be re-paused', (
      tester,
    ) async {
      final timer =
          _TimerRepository(
              paused: const TimeTrackingSession(id: 'paused', taskId: 'task-9'),
            )
            ..failStart = true
            ..failPauses = 2;
      await pumpBoard(tester, timer: timer);

      await replacePaused(tester);

      expect(timer.resumes, ['paused']);
      expect(timer.pauses, hasLength(2));
      expect(
        find.text(
          "Couldn't start focus. Your previous timer is running again.",
        ),
        findsOneWidget,
      );
      expect(find.textContaining('was ended'), findsNothing);
      await drainToasts(tester);
    });

    testWidgets('says plainly when the paused timer could not be restored', (
      tester,
    ) async {
      final timer =
          _TimerRepository(
              paused: const TimeTrackingSession(id: 'paused', taskId: 'task-9'),
            )
            ..failStart = true
            ..failResume = true;
      await pumpBoard(tester, timer: timer);

      await replacePaused(tester);

      expect(
        find.text(
          "Couldn't start focus, and your paused timer was ended. "
          'Open the timer to resume it.',
        ),
        findsOneWidget,
      );
      expect(find.text('Open timer'), findsOneWidget);
      await drainToasts(tester);
    });

    testWidgets('resumes a timer paused on the same task', (tester) async {
      final timer = _TimerRepository(
        paused: const TimeTrackingSession(id: 'paused', taskId: 'task-1'),
      );
      await pumpBoard(tester, timer: timer);

      await openMenu(tester, 'Alpha task');
      await tester.tap(find.byKey(const ValueKey('task-row-menu-focus')));
      await tester.pumpAndSettle();

      expect(find.text('End the paused timer?'), findsNothing);
      expect(timer.resumes, ['paused']);
      expect(timer.starts, isEmpty);
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
