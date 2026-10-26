import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_controller.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_notifier.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_state.dart';
import 'package:mobile/features/time_tracker/pomodoro/pomodoro_store.dart';
import 'package:mobile/features/time_tracker/widgets/pomodoro_panel.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Timer extends MockCubit<TimeTrackerState> implements TimeTrackerCubit {}

class _Workspaces extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Repository extends Fake implements ITimeTrackerRepository {
  final List<String> calls = [];

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
    calls.add('start:$title');
    return const TimeTrackingSession(id: 's1');
  }

  @override
  Future<TimeTrackingSession> pauseSession(
    String wsId,
    String sessionId, {
    String? breakTypeId,
    String? breakTypeName,
  }) async {
    calls.add('pause:$sessionId');
    return TimeTrackingSession(id: sessionId);
  }
}

class _Notifier implements PomodoroNotifier {
  @override
  Future<void> schedule({
    required DateTime at,
    required String title,
    required String body,
    String? wsId,
    String? userId,
  }) async {}

  @override
  Future<void> cancel() async {}
}

class _Store extends PomodoroStore {
  @override
  Future<PomodoroState?> read() async => null;

  @override
  Future<void> write(PomodoroState state) async {}
}

void main() {
  late _Timer timer;
  late _Repository repository;
  late PomodoroController controller;
  final now = DateTime(2026, 10, 26, 9);

  setUp(() {
    timer = _Timer();
    repository = _Repository();
    whenListen(
      timer,
      const Stream<TimeTrackerState>.empty(),
      initialState: const TimeTrackerState(),
    );
    when(
      () => timer.loadData(
        any(),
        any(),
        forceRefresh: any(named: 'forceRefresh'),
      ),
    ).thenAnswer((_) async {});
    controller = PomodoroController(
      repository: repository,
      loadSettings: () async => const PomodoroSettings(),
      notificationCopy: (_) => (title: '', body: ''),
      notifier: _Notifier(),
      store: _Store(),
      now: () => now,
    );
  });

  // Each test closes its controller inside the test body; a second close
  // in tearDown never completes outside the widget test's fake clock.

  Future<void> pump(WidgetTester tester) async {
    final workspaces = _Workspaces();
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: Workspace(id: 'ws', name: 'Kallo'),
      ),
    );
    final auth = _Auth();
    whenListen(
      auth,
      const Stream<AuthState>.empty(),
      initialState: AuthState.authenticated(
        supa.User.fromJson({
          'id': 'u1',
          'aud': 'authenticated',
          'role': 'authenticated',
          'app_metadata': const <String, dynamic>{},
          'user_metadata': const <String, dynamic>{},
          'created_at': '2024-01-01T00:00:00.000000Z',
        })!,
      ),
    );
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<TimeTrackerCubit>.value(value: timer),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<PomodoroController>.value(value: controller),
        ],
        child: const Scaffold(
          body: SingleChildScrollView(
            padding: EdgeInsets.all(16),
            child: PomodoroPanel(),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('starts focus and counts down; pause holds it', (tester) async {
    await pump(tester);

    expect(find.text('25 min focus · 5 min break'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('pomodoro-start')));
    await tester.pump();
    await tester.pump();

    expect(repository.calls, ['start:Focus time']);
    expect(find.text('25:00'), findsOneWidget);
    expect(find.text('Focus 1 of 4'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('pomodoro-pause')));
    await tester.pump();
    await tester.pump();
    expect(repository.calls.last, 'pause:s1');
    expect(find.byKey(const ValueKey('pomodoro-resume')), findsOneWidget);
    await controller.close();
    await tester.pump(const Duration(seconds: 2));
  });

  testWidgets('the running panel fits 320dp at 2x text', (tester) async {
    tester.view
      ..physicalSize = const Size(320, 640)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await controller.startFocus(userId: 'u1', wsId: 'ws', title: 'Focus');

    await pump(tester);

    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('pomodoro-remaining')), findsOneWidget);
    expect(find.byKey(const ValueKey('pomodoro-stop')), findsOneWidget);
    await controller.close();
    await tester.pump(const Duration(seconds: 2));
  });
}
