import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_cubit.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/features/time_tracker/widgets/history_tab.dart';
import 'package:mobile/features/time_tracker/widgets/running_session_info_card.dart';
import 'package:mobile/features/time_tracker/widgets/session_tile.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_goals/goal_card.dart';
import 'package:mobile/features/time_tracker/widgets/time_tracker_goals/goals_section.dart';
import 'package:mobile/features/time_tracker/widgets/timer_display.dart';
import 'package:mobile/features/time_tracker/widgets/timer_dock_actions.dart';
import 'package:mobile/features/time_tracker/widgets/timer_tab.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/helpers.dart';

class _Timer extends MockCubit<TimeTrackerState> implements TimeTrackerCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

const _workspace = WorkspaceState(
  status: WorkspaceStatus.loaded,
  currentWorkspace: Workspace(id: 'ws', name: 'Workspace'),
);

const _signedIn = AuthState.authenticated(
  User(
    id: 'user',
    appMetadata: {},
    userMetadata: {},
    aud: 'authenticated',
    createdAt: '2026-01-01T00:00:00Z',
  ),
);

TimeTrackingSession _session(String id) => TimeTrackingSession(
  id: id,
  startTime: DateTime(2026, 11, 14, 9),
  endTime: DateTime(2026, 11, 14, 10),
  durationSeconds: 3600,
);

TimeTrackingGoal _goal(String id) =>
    TimeTrackingGoal(id: id, wsId: 'ws', userId: 'user', dailyGoalMinutes: 60);

/// Counts dirty-widget rebuilds for [types] until the returned map is done.
Map<Type, int> _countRebuilds(Set<Type> types) {
  final rebuilds = <Type, int>{};
  final previous = debugOnRebuildDirtyWidget;
  debugOnRebuildDirtyWidget = (element, builtOnce) {
    previous?.call(element, builtOnce);
    final type = element.widget.runtimeType;
    if (types.contains(type)) {
      rebuilds.update(type, (count) => count + 1, ifAbsent: () => 1);
    }
  };
  addTearDown(() => debugOnRebuildDirtyWidget = previous);
  return rebuilds;
}

void main() {
  late _Timer timer;
  late StreamController<TimeTrackerState> states;
  late _Workspaces workspaces;
  late _Auth auth;

  setUp(() {
    timer = _Timer();
    states = StreamController<TimeTrackerState>.broadcast();
    workspaces = _Workspaces();
    auth = _Auth();
    whenListen(
      workspaces,
      const Stream<WorkspaceState>.empty(),
      initialState: _workspace,
    );
    whenListen(auth, const Stream<AuthState>.empty(), initialState: _signedIn);
  });

  tearDown(() async {
    await states.close();
    await timer.close();
    await workspaces.close();
    await auth.close();
  });

  Future<void> pumpScoped(WidgetTester tester, Widget child) async {
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<TimeTrackerCubit>.value(value: timer),
          BlocProvider<WorkspaceCubit>.value(value: workspaces),
          BlocProvider<AuthCubit>.value(value: auth),
        ],
        child: child,
      ),
    );
    await tester.pump();
  }

  /// Emits [ticks] states that differ from [base] only in `elapsed`,
  /// mirroring the cubit's per-second `_startTick` emissions.
  Future<void> emitElapsedTicks(
    WidgetTester tester,
    TimeTrackerState base,
    int ticks,
  ) async {
    for (var second = 1; second <= ticks; second++) {
      states.add(base.copyWith(elapsed: Duration(seconds: second)));
      await tester.pump();
      await tester.pump();
    }
  }

  testWidgets('elapsed-only ticks do not rebuild history session tiles', (
    tester,
  ) async {
    final initial = TimeTrackerState(
      status: TimeTrackerStatus.loaded,
      historyViewMode: HistoryViewMode.day,
      historyAnchorDate: DateTime(2026, 11, 14),
      historySessions: [_session('s1'), _session('s2'), _session('s3')],
    );
    whenListen(timer, states.stream, initialState: initial);

    await pumpScoped(tester, const HistoryTab());
    expect(find.byType(SessionTile), findsNWidgets(3));

    final rebuilds = _countRebuilds({SessionTile});
    await emitElapsedTicks(tester, initial, 3);
    expect(rebuilds[SessionTile] ?? 0, 0);
    expect(find.byType(SessionTile), findsNWidgets(3));

    // A real history change still rebuilds the list.
    rebuilds.clear();
    states.add(
      initial.copyWith(
        historySessions: [...initial.historySessions, _session('s4')],
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.byType(SessionTile), findsNWidgets(4));
    expect(rebuilds[SessionTile] ?? 0, greaterThan(0));
    expect(tester.takeException(), isNull);
  });

  testWidgets('ticks still rebuild history while a row is open', (
    tester,
  ) async {
    final initial = TimeTrackerState(
      status: TimeTrackerStatus.loaded,
      historyViewMode: HistoryViewMode.day,
      historyAnchorDate: DateTime(2026, 11, 14),
      historySessions: [
        _session('s1'),
        TimeTrackingSession(id: 'open', startTime: DateTime(2026, 11, 14, 11)),
      ],
    );
    whenListen(timer, states.stream, initialState: initial);

    await pumpScoped(tester, const HistoryTab());
    expect(find.byType(SessionTile), findsNWidgets(2));

    // The open row's duration is measured against now, so it keeps ticking.
    final rebuilds = _countRebuilds({SessionTile});
    await emitElapsedTicks(tester, initial, 3);
    expect(rebuilds[SessionTile] ?? 0, greaterThanOrEqualTo(3));
    expect(tester.takeException(), isNull);
  });

  testWidgets('elapsed-only ticks do not rebuild goal cards', (tester) async {
    final initial = TimeTrackerState(
      status: TimeTrackerStatus.loaded,
      goalsWorkspaceId: 'ws',
      goals: [_goal('g1'), _goal('g2')],
    );
    whenListen(timer, states.stream, initialState: initial);

    await pumpScoped(
      tester,
      const Scaffold(
        body: SingleChildScrollView(child: TimeTrackerGoalsSection(wsId: 'ws')),
      ),
    );
    expect(find.byType(GoalCard), findsNWidgets(2));

    final rebuilds = _countRebuilds({GoalCard});
    await emitElapsedTicks(tester, initial, 3);
    expect(rebuilds[GoalCard] ?? 0, 0);
    expect(find.byType(GoalCard), findsNWidgets(2));

    // A real goal change still rebuilds the section.
    rebuilds.clear();
    states.add(initial.copyWith(goals: [...initial.goals, _goal('g3')]));
    await tester.pump();
    await tester.pump();
    expect(find.byType(GoalCard), findsNWidgets(3));
    expect(rebuilds[GoalCard] ?? 0, greaterThan(0));
    expect(tester.takeException(), isNull);
  });

  testWidgets('elapsed ticks update the clock without the controls', (
    tester,
  ) async {
    final initial = TimeTrackerState(
      status: TimeTrackerStatus.loaded,
      runningSession: TimeTrackingSession(
        id: 'running',
        startTime: DateTime(2026, 11, 14, 9),
        isRunningFlag: true,
      ),
    );
    whenListen(timer, states.stream, initialState: initial);

    await pumpScoped(tester, const TimerTab());
    expect(find.text('00:00:00'), findsOneWidget);
    expect(find.byType(TimerDockActions), findsOneWidget);
    expect(find.byType(RunningSessionInfoCard), findsOneWidget);

    final rebuilds = _countRebuilds({
      TimerDisplay,
      TimerDockActions,
      RunningSessionInfoCard,
    });
    await emitElapsedTicks(tester, initial, 3);
    expect(find.text('00:00:03'), findsOneWidget);
    expect(rebuilds[TimerDisplay] ?? 0, 3, reason: 'clock keeps ticking');
    expect(rebuilds[TimerDockActions] ?? 0, 0);
    expect(rebuilds[RunningSessionInfoCard] ?? 0, 0);

    // Pause still rebuilds the controls and the clock status.
    rebuilds.clear();
    states.add(
      initial.copyWith(elapsed: const Duration(seconds: 3), isPaused: true),
    );
    await tester.pump();
    await tester.pump();
    expect(rebuilds[TimerDockActions] ?? 0, greaterThan(0));
    expect(find.text('Paused'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
