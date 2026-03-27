import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/view/habits_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _FakeHabitTrackerRepository implements IHabitTrackerRepository {
  _FakeHabitTrackerRepository();

  final HabitTracker tracker = HabitTracker(
    id: 'tracker-1',
    wsId: 'ws-personal',
    name: 'Water',
    color: 'CYAN',
    icon: 'Droplets',
    trackingMode: HabitTrackerTrackingMode.eventLog,
    targetPeriod: HabitTrackerTargetPeriod.daily,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: 8,
    primaryMetricKey: 'glasses',
    aggregationStrategy: HabitTrackerAggregationStrategy.sum,
    inputSchema: const [
      HabitTrackerFieldSchema(
        key: 'glasses',
        label: 'Glasses',
        type: HabitTrackerFieldType.number,
        required: true,
        unit: 'glass',
      ),
    ],
    quickAddValues: const [1, 2, 3],
    freezeAllowance: 2,
    recoveryWindowPeriods: 1,
    startDate: '2026-03-25',
    isActive: true,
    createdAt: DateTime(2026, 3, 25),
    updatedAt: DateTime(2026, 3, 25),
  );

  @override
  Future<void> archiveTracker(String wsId, String trackerId) async {}

  @override
  Future<HabitTrackerEntry> createEntry(
    String wsId,
    String trackerId,
    HabitTrackerEntryInput input,
  ) async {
    throw UnimplementedError();
  }

  @override
  Future<void> createStreakAction(
    String wsId,
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) async {}

  @override
  Future<HabitTracker> createTracker(
    String wsId,
    HabitTrackerInput input,
  ) async {
    return tracker;
  }

  @override
  Future<void> deleteEntry(
    String wsId,
    String trackerId,
    String entryId,
  ) async {}

  @override
  Future<HabitTrackerDetailResponse> getTrackerDetail(
    String wsId,
    String trackerId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
  }) async {
    return HabitTrackerDetailResponse(
      tracker: tracker,
      entries: const [],
      currentMember: const HabitTrackerMemberSummary(
        member: HabitTrackerMember(
          userId: 'user-1',
          displayName: 'Alex',
        ),
        total: 8,
        entryCount: 4,
        currentPeriodTotal: 4,
        streak: HabitTrackerStreakSummary(
          currentStreak: 3,
          bestStreak: 5,
          freezeCount: 2,
          freezesUsed: 0,
          perfectWeekCount: 1,
          consistencyRate: 0.8,
          recoveryWindow: HabitTrackerRecoveryWindowState(eligible: false),
        ),
      ),
      team: const HabitTrackerTeamSummary(
        activeMembers: 1,
        totalEntries: 4,
        totalValue: 8,
        averageConsistencyRate: 0.8,
        topStreak: 5,
      ),
      memberSummaries: const [],
      leaderboard: const [],
      currentPeriodMetrics: const [],
    );
  }

  @override
  Future<HabitTrackerListResponse> listTrackers(
    String wsId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
  }) async {
    return HabitTrackerListResponse(
      trackers: [
        HabitTrackerCardSummary(
          tracker: tracker,
          currentMember: const HabitTrackerMemberSummary(
            member: HabitTrackerMember(
              userId: 'user-1',
              displayName: 'Alex',
            ),
            total: 8,
            entryCount: 4,
            currentPeriodTotal: 4,
            streak: HabitTrackerStreakSummary(
              currentStreak: 3,
              bestStreak: 5,
              freezeCount: 2,
              freezesUsed: 0,
              perfectWeekCount: 1,
              consistencyRate: 0.8,
              recoveryWindow: HabitTrackerRecoveryWindowState(eligible: false),
            ),
          ),
          team: const HabitTrackerTeamSummary(
            activeMembers: 1,
            totalEntries: 4,
            totalValue: 8,
            averageConsistencyRate: 0.8,
            topStreak: 5,
          ),
          leaderboard: const [],
        ),
      ],
      members: const [],
      scope: scope,
      viewerUserId: 'viewer-1',
      scopeUserId: userId,
    );
  }

  @override
  Future<HabitTracker> updateTracker(
    String wsId,
    String trackerId,
    HabitTrackerInput input,
  ) async {
    return tracker;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late _MockWorkspaceCubit workspaceCubit;
  late _FakeHabitTrackerRepository repository;

  Widget buildSurface({
    required WorkspaceCubit workspaceCubit,
    required Widget child,
  }) {
    return MultiBlocProvider(
      providers: [
        BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
        BlocProvider(create: (_) => ShellChromeActionsCubit()),
      ],
      child: Stack(
        children: [
          child,
          const Align(
            alignment: Alignment.topRight,
            child: ShellInjectedActionsHost(matchedLocation: '/habits'),
          ),
        ],
      ),
    );
  }

  Future<void> pumpUi(WidgetTester tester, {int frames = 8}) async {
    for (var i = 0; i < frames; i++) {
      await tester.pump(const Duration(milliseconds: 60));
    }
  }

  setUp(() async {
    HabitsCubit.clearCache();
    await CacheStore.instance.clearScope();
    workspaceCubit = _MockWorkspaceCubit();
    repository = _FakeHabitTrackerRepository();
    when(() => workspaceCubit.state).thenReturn(
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [
          Workspace(id: 'ws-personal', name: 'Personal', personal: true),
        ],
        currentWorkspace: Workspace(
          id: 'ws-personal',
          name: 'Personal',
          personal: true,
        ),
      ),
    );
    when(() => workspaceCubit.stream).thenAnswer((_) => const Stream.empty());
  });

  testWidgets('hides scope controls in a personal workspace', (tester) async {
    await tester.pumpApp(
      buildSurface(
        workspaceCubit: workspaceCubit,
        child: HabitsPage(repository: repository),
      ),
    );
    await pumpUi(tester);

    expect(find.text('Self'), findsNothing);
    expect(find.text('Team'), findsNothing);
    expect(find.text('Member'), findsNothing);
  });
}
