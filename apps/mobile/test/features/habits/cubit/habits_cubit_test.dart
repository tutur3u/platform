import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/habits/cubit/habits_state.dart';
import 'package:mocktail/mocktail.dart';

class _MockHabitTrackerRepository extends Mock
    implements IHabitTrackerRepository {}

HabitTrackerListResponse _listResponse({
  required String trackerId,
  String trackerName = 'Water',
  List<HabitTrackerMember> members = const [],
}) {
  return HabitTrackerListResponse(
    trackers: [
      HabitTrackerCardSummary(
        tracker: HabitTracker(
          id: trackerId,
          wsId: 'ws-1',
          name: trackerName,
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
            ),
          ],
          quickAddValues: const [1, 2, 3],
          freezeAllowance: 2,
          recoveryWindowPeriods: 1,
          startDate: '2026-03-25',
          isActive: true,
          createdAt: DateTime(2026, 3, 25),
          updatedAt: DateTime(2026, 3, 25),
        ),
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
    members: members,
    scope: HabitTrackerScope.self,
    viewerUserId: 'viewer-1',
  );
}

HabitTrackerDetailResponse _detailResponse(String trackerId) {
  return HabitTrackerDetailResponse(
    tracker: _listResponse(trackerId: trackerId).trackers.single.tracker,
    entries: [
      HabitTrackerEntry(
        id: 'entry-$trackerId',
        wsId: 'ws-1',
        trackerId: trackerId,
        userId: 'user-1',
        entryKind: HabitTrackerEntryKind.eventLog,
        entryDate: '2026-03-25',
        values: const {'glasses': 2.0},
        tags: const [],
        createdAt: trackerId == 'tracker-1'
            ? DateTime(2026, 3, 25, 9)
            : DateTime(2026, 3, 24, 18),
        updatedAt: trackerId == 'tracker-1'
            ? DateTime(2026, 3, 25, 9)
            : DateTime(2026, 3, 24, 18),
      ),
    ],
    currentMember: _listResponse(
      trackerId: trackerId,
    ).trackers.single.currentMember,
    team: _listResponse(trackerId: trackerId).trackers.single.team,
    memberSummaries: const [],
    leaderboard: const [],
    currentPeriodMetrics: const [],
  );
}

void main() {
  setUpAll(() {
    registerFallbackValue(HabitTrackerScope.self);
    registerFallbackValue(
      const HabitTrackerEntryInput(
        entryDate: '2026-03-25',
        values: {'glasses': 1.0},
      ),
    );
  });

  group('HabitsCubit', () {
    late _MockHabitTrackerRepository repository;
    late HabitsCubit cubit;

    setUp(() {
      HabitsCubit.clearCache();
      repository = _MockHabitTrackerRepository();
      cubit = HabitsCubit(repository: repository);
    });

    tearDown(() async {
      await cubit.close();
    });

    test('loadWorkspace selects the first tracker and loads detail', () async {
      when(
        () => repository.listTrackers(
          'ws-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => _listResponse(trackerId: 'tracker-1'));
      when(
        () => repository.getTrackerDetail(
          'ws-1',
          'tracker-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => _detailResponse('tracker-1'));

      await cubit.loadWorkspace('ws-1');

      expect(cubit.state.status, HabitsStatus.loaded);
      expect(cubit.state.selectedTrackerId, 'tracker-1');
      expect(cubit.state.detail?.tracker.id, 'tracker-1');
    });

    test('member scope auto-selects the first member and reloads', () async {
      const members = [
        HabitTrackerMember(userId: 'user-2', displayName: 'Jamie'),
        HabitTrackerMember(userId: 'user-3', displayName: 'Casey'),
      ];
      when(
        () => repository.listTrackers(
          'ws-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => _listResponse(trackerId: 'tracker-1'));
      when(
        () => repository.getTrackerDetail(
          'ws-1',
          'tracker-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => _detailResponse('tracker-1'));
      when(
        () => repository.listTrackers(
          'ws-1',
          scope: HabitTrackerScope.member,
        ),
      ).thenAnswer(
        (_) async => _listResponse(trackerId: 'tracker-1', members: members),
      );
      when(
        () => repository.listTrackers(
          'ws-1',
          scope: HabitTrackerScope.member,
          userId: 'user-2',
        ),
      ).thenAnswer(
        (_) async => _listResponse(trackerId: 'tracker-1', members: members),
      );
      when(
        () => repository.getTrackerDetail(
          'ws-1',
          'tracker-1',
          scope: HabitTrackerScope.member,
          userId: 'user-2',
        ),
      ).thenAnswer((_) async => _detailResponse('tracker-1'));

      await cubit.loadWorkspace('ws-1');
      await cubit.setScope(HabitTrackerScope.member);

      expect(cubit.state.selectedScope, HabitTrackerScope.member);
      expect(cubit.state.selectedMemberId, 'user-2');
      verify(
        () => repository.getTrackerDetail(
          'ws-1',
          'tracker-1',
          scope: HabitTrackerScope.member,
          userId: 'user-2',
        ),
      ).called(1);
    });

    test('stale workspace responses are ignored', () async {
      final ws1Completer = Completer<HabitTrackerListResponse>();
      final ws2Completer = Completer<HabitTrackerListResponse>();

      when(
        () => repository.listTrackers(
          'ws-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) => ws1Completer.future);
      when(
        () => repository.listTrackers(
          'ws-2',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) => ws2Completer.future);
      when(
        () => repository.getTrackerDetail(
          any(),
          any(),
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((invocation) async {
        final trackerId = invocation.positionalArguments[1] as String;
        return _detailResponse(trackerId);
      });

      final first = cubit.loadWorkspace('ws-1');
      final second = cubit.loadWorkspace('ws-2');

      ws1Completer.complete(_listResponse(trackerId: 'tracker-ws-1'));
      ws2Completer.complete(_listResponse(trackerId: 'tracker-ws-2'));

      await Future.wait([first, second]);

      expect(cubit.state.activeWorkspaceId, 'ws-2');
      expect(cubit.state.selectedTrackerId, 'tracker-ws-2');
      expect(cubit.state.detail?.tracker.id, 'tracker-ws-2');
    });

    test(
      'createEntry clears quick drafts after a successful mutation',
      () async {
        when(
          () => repository.listTrackers(
            'ws-1',
            scope: any(named: 'scope'),
            userId: any(named: 'userId'),
          ),
        ).thenAnswer((_) async => _listResponse(trackerId: 'tracker-1'));
        when(
          () => repository.getTrackerDetail(
            'ws-1',
            'tracker-1',
            scope: any(named: 'scope'),
            userId: any(named: 'userId'),
          ),
        ).thenAnswer((_) async => _detailResponse('tracker-1'));
        when(
          () => repository.createEntry(
            'ws-1',
            'tracker-1',
            any(),
          ),
        ).thenAnswer(
          (_) async => HabitTrackerEntry(
            id: 'entry-1',
            wsId: 'ws-1',
            trackerId: 'tracker-1',
            userId: 'user-1',
            entryKind: HabitTrackerEntryKind.eventLog,
            entryDate: '2026-03-25',
            values: const {'glasses': 2.0},
            tags: const [],
            createdAt: DateTime(2026, 3, 25),
            updatedAt: DateTime(2026, 3, 25),
          ),
        );

        await cubit.loadWorkspace('ws-1');
        cubit.setQuickLogDraft('tracker-1', '2');

        await cubit.createEntry(
          'tracker-1',
          const HabitTrackerEntryInput(
            entryDate: '2026-03-25',
            values: {'glasses': 2.0},
          ),
        );

        expect(cubit.state.quickDraftFor('tracker-1'), isEmpty);
      },
    );

    test('loadActivity aggregates entries across trackers', () async {
      when(
        () => repository.listTrackers(
          'ws-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer(
        (_) async => HabitTrackerListResponse(
          trackers: [
            ..._listResponse(trackerId: 'tracker-1').trackers,
            ..._listResponse(
              trackerId: 'tracker-2',
              trackerName: 'Reading',
            ).trackers,
          ],
          members: const [],
          scope: HabitTrackerScope.self,
          viewerUserId: 'viewer-1',
        ),
      );
      when(
        () => repository.getTrackerDetail(
          'ws-1',
          'tracker-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => _detailResponse('tracker-1'));
      when(
        () => repository.getTrackerDetail(
          'ws-1',
          'tracker-2',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => _detailResponse('tracker-2'));

      await cubit.loadWorkspace('ws-1');
      await cubit.loadActivity(refresh: true);

      expect(cubit.state.activityStatus, HabitsStatus.loaded);
      expect(cubit.state.activityEntries, hasLength(2));
      expect(cubit.state.activityEntries.first.tracker.id, 'tracker-1');
      expect(cubit.state.activityEntries.last.tracker.id, 'tracker-2');
    });

    test('reuses fresh cached state across cubit instances', () async {
      when(
        () => repository.listTrackers(
          'ws-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => _listResponse(trackerId: 'tracker-1'));
      when(
        () => repository.getTrackerDetail(
          'ws-1',
          'tracker-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).thenAnswer((_) async => _detailResponse('tracker-1'));

      await cubit.loadWorkspace('ws-1');
      await cubit.loadActivity();
      await cubit.close();

      final cachedCubit = HabitsCubit(
        repository: repository,
        initialState: HabitsCubit.cachedStateForWorkspace('ws-1'),
      );
      addTearDown(cachedCubit.close);

      await cachedCubit.loadWorkspace('ws-1');
      await cachedCubit.loadActivity();

      expect(cachedCubit.state.status, HabitsStatus.loaded);
      expect(cachedCubit.state.activityStatus, HabitsStatus.loaded);
      verify(
        () => repository.listTrackers(
          'ws-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).called(1);
      verify(
        () => repository.getTrackerDetail(
          'ws-1',
          'tracker-1',
          scope: any(named: 'scope'),
          userId: any(named: 'userId'),
        ),
      ).called(2);
    });
  });
}
