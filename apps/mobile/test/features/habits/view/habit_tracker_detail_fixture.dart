import 'dart:async';

import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';

class DetailHabitTrackerRepository implements IHabitTrackerRepository {
  DetailHabitTrackerRepository();

  Completer<void>? detailGate;
  int detailReads = 0;

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
    bool requireFresh = false,
  }) async {
    detailReads++;
    await detailGate?.future;
    return HabitTrackerDetailResponse(
      tracker: tracker,
      entries: const [],
      currentMember: const HabitTrackerMemberSummary(
        member: HabitTrackerMember(userId: 'user-1', displayName: 'Alex'),
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
    bool requireFresh = false,
  }) async {
    return HabitTrackerListResponse(
      trackers: [
        HabitTrackerCardSummary(
          tracker: tracker,
          currentMember: const HabitTrackerMemberSummary(
            member: HabitTrackerMember(userId: 'user-1', displayName: 'Alex'),
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
