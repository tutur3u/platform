import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/view/habits_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _FakeHabitTrackerRepository implements IHabitTrackerRepository {
  _FakeHabitTrackerRepository();

  final HabitTracker tracker = HabitTracker(
    id: 'tracker-1',
    wsId: 'ws-1',
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
    return HabitTrackerEntry(
      id: 'entry-1',
      wsId: wsId,
      trackerId: trackerId,
      userId: 'user-1',
      entryKind: HabitTrackerEntryKind.eventLog,
      entryDate: input.entryDate,
      values: input.values,
      tags: input.tags,
      createdAt: DateTime(2026, 3, 25),
      updatedAt: DateTime(2026, 3, 25),
    );
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
      entries: [
        HabitTrackerEntry(
          id: 'entry-1',
          wsId: 'ws-1',
          trackerId: 'tracker-1',
          userId: 'user-1',
          entryKind: HabitTrackerEntryKind.eventLog,
          entryDate: '2026-03-25',
          values: const {'glasses': 2.0},
          tags: const ['morning'],
          member: const HabitTrackerMember(
            userId: 'user-1',
            displayName: 'Alex',
          ),
          createdAt: DateTime(2026, 3, 25),
          updatedAt: DateTime(2026, 3, 25),
        ),
      ],
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
        activeMembers: 2,
        totalEntries: 6,
        totalValue: 12,
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
            activeMembers: 2,
            totalEntries: 6,
            totalValue: 12,
            averageConsistencyRate: 0.8,
            topStreak: 5,
          ),
          leaderboard: const [],
        ),
      ],
      members: const [
        HabitTrackerMember(userId: 'user-1', displayName: 'Alex'),
      ],
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

  setUp(() {
    HabitsCubit.clearCache();
    workspaceCubit = _MockWorkspaceCubit();
    repository = _FakeHabitTrackerRepository();
    when(() => workspaceCubit.state).thenReturn(
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [
          Workspace(id: 'ws-1', name: 'Workspace'),
        ],
        currentWorkspace: Workspace(id: 'ws-1', name: 'Workspace'),
      ),
    );
    when(() => workspaceCubit.stream).thenAnswer((_) => const Stream.empty());
  });

  testWidgets('renders trackers and opens the detail sheet', (tester) async {
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: HabitsPage(repository: repository),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Water'), findsOneWidget);
    expect(find.text('Habits'), findsWidgets);

    await tester.tap(find.text('Water').first);
    await tester.pumpAndSettle();

    expect(find.widgetWithText(Tab, 'Overview'), findsOneWidget);
    expect(find.widgetWithText(Tab, 'Entries'), findsOneWidget);
    expect(find.widgetWithText(Tab, 'Leaderboard'), findsOneWidget);
  });

  testWidgets('shows member picker when switching to member scope', (
    tester,
  ) async {
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: HabitsPage(repository: repository),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Member'));
    await tester.pumpAndSettle();

    expect(find.text('View member'), findsOneWidget);
  });

  testWidgets('renders aggregated activity entries in activity section', (
    tester,
  ) async {
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: HabitsPage(
          repository: repository,
          initialSection: HabitsSection.activity,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Activity'), findsOneWidget);
    expect(find.text('Alex'), findsOneWidget);
    expect(find.text('Glasses'), findsOneWidget);
    expect(find.text('2 glass'), findsOneWidget);
  });

  testWidgets('search is hidden by default and toggles from the app bar', (
    tester,
  ) async {
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: HabitsPage(repository: repository),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.byType(shad.TextField), findsNothing);

    await tester.tap(find.byKey(const Key('habits-search-toggle')));
    await tester.pumpAndSettle();

    expect(find.byType(shad.TextField), findsOneWidget);

    await tester.tap(find.byKey(const Key('habits-search-toggle')));
    await tester.pumpAndSettle();

    expect(find.byType(shad.TextField), findsNothing);
  });

  testWidgets('hides scope controls in a personal workspace', (tester) async {
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

    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: HabitsPage(repository: repository),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Self'), findsNothing);
    expect(find.text('Team'), findsNothing);
    expect(find.text('Member'), findsNothing);
  });

  testWidgets('hides leaderboard tab in a personal workspace detail view', (
    tester,
  ) async {
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

    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: workspaceCubit,
        child: HabitsPage(repository: repository),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Water').first);
    await tester.pumpAndSettle();

    expect(find.widgetWithText(Tab, 'Overview'), findsOneWidget);
    expect(find.widgetWithText(Tab, 'Entries'), findsOneWidget);
    expect(find.widgetWithText(Tab, 'Leaderboard'), findsNothing);
  });
}
