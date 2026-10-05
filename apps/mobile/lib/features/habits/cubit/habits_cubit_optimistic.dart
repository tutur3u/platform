part of 'habits_cubit.dart';

extension _HabitsOptimistic on HabitsCubit {
  HabitsState _applyCreatedEntryLocally(
    HabitsState currentState,
    String trackerId,
    HabitTrackerEntry entry,
  ) {
    final listResponse = currentState.listResponse;
    if (listResponse == null) {
      return currentState;
    }

    final trackerIndex = listResponse.trackers.indexWhere(
      (value) => value.tracker.id == trackerId,
    );
    if (trackerIndex < 0) {
      return currentState;
    }

    final summary = listResponse.trackers[trackerIndex];
    final nextSummary = _patchSummaryWithEntry(
      currentState,
      listResponse,
      summary,
      entry,
    );
    final nextTrackers = [...listResponse.trackers];
    nextTrackers[trackerIndex] = nextSummary;

    var nextState = currentState.copyWith(
      listResponse: listResponse.copyWith(trackers: nextTrackers),
    );

    if (currentState.detail?.tracker.id == trackerId) {
      final detail = currentState.detail!;
      final nextEntries = [
        entry,
        ...detail.entries.where((value) => value.id != entry.id),
      ];
      nextState = nextState.copyWith(
        detail: detail.copyWith(
          entries: nextEntries,
          currentMember: nextSummary.currentMember,
          team: nextSummary.team,
        ),
      );
    }

    if (currentState.activityStatus != HabitsStatus.initial ||
        currentState.activityEntries.isNotEmpty) {
      final tracker = nextSummary.tracker;
      final nextActivityEntries = [
        HabitActivityEntry(tracker: tracker, entry: entry),
        ...currentState.activityEntries.where(
          (value) => value.entry.id != entry.id,
        ),
      ]..sort((left, right) => right.timestamp.compareTo(left.timestamp));
      nextState = nextState.copyWith(
        activityStatus: HabitsStatus.loaded,
        activityEntries: nextActivityEntries,
      );
    }

    return nextState;
  }

  HabitTrackerCardSummary _patchSummaryWithEntry(
    HabitsState currentState,
    HabitTrackerListResponse listResponse,
    HabitTrackerCardSummary summary,
    HabitTrackerEntry entry,
  ) {
    final tracker = summary.tracker;
    final entryValue = _primaryEntryValue(tracker, entry);
    final affectsCurrentPeriod = _entryAffectsCurrentPeriod(tracker, entry);
    final memberSummary =
        summary.currentMember ??
        _buildFallbackCurrentMember(currentState, listResponse, entry);

    final nextCurrentMember = memberSummary == null
        ? null
        : _patchCurrentMemberSummary(
            memberSummary,
            tracker,
            entry,
            entryValue,
            affectsCurrentPeriod,
          );
    final previousCurrentPeriod =
        summary.currentMember?.currentPeriodTotal ?? 0;
    final nextCurrentPeriod = nextCurrentMember?.currentPeriodTotal ?? 0;
    final nextTeam = summary.team == null
        ? null
        : _patchTeamSummary(
            summary.team!,
            entryValue,
            previousCurrentPeriod: previousCurrentPeriod,
            nextCurrentPeriod: nextCurrentPeriod,
          );

    return summary.copyWith(currentMember: nextCurrentMember, team: nextTeam);
  }

  HabitTrackerMemberSummary? _buildFallbackCurrentMember(
    HabitsState currentState,
    HabitTrackerListResponse listResponse,
    HabitTrackerEntry entry,
  ) {
    final targetUserId = currentState.selectedScope == HabitTrackerScope.member
        ? currentState.selectedMemberId
        : listResponse.viewerUserId;
    if (targetUserId == null || targetUserId.isEmpty) {
      return null;
    }

    HabitTrackerMember? member;
    for (final value in listResponse.members) {
      if (value.userId == targetUserId) {
        member = value;
        break;
      }
    }
    member ??= entry.member != null && entry.member!.userId == targetUserId
        ? entry.member
        : null;
    member ??= HabitTrackerMember(userId: targetUserId, displayName: 'You');

    return HabitTrackerMemberSummary(
      member: member,
      total: 0,
      entryCount: 0,
      currentPeriodTotal: 0,
      streak: const HabitTrackerStreakSummary(
        currentStreak: 0,
        bestStreak: 0,
        freezeCount: 0,
        freezesUsed: 0,
        perfectWeekCount: 0,
        consistencyRate: 0,
        recoveryWindow: HabitTrackerRecoveryWindowState(eligible: false),
      ),
    );
  }

  HabitTrackerMemberSummary _patchCurrentMemberSummary(
    HabitTrackerMemberSummary summary,
    HabitTracker tracker,
    HabitTrackerEntry entry,
    double entryValue,
    bool affectsCurrentPeriod,
  ) {
    final nextTotal = _applyAggregation(
      currentValue: summary.total,
      entryValue: entryValue,
      strategy: tracker.aggregationStrategy,
    );
    final nextCurrentPeriod = affectsCurrentPeriod
        ? _applyAggregation(
            currentValue: summary.currentPeriodTotal,
            entryValue: entryValue,
            strategy: tracker.aggregationStrategy,
          )
        : summary.currentPeriodTotal;

    return summary.copyWith(
      total: nextTotal,
      entryCount: summary.entryCount + 1,
      currentPeriodTotal: nextCurrentPeriod,
      latestValue: entryValue,
      latestEntryId: entry.id,
      latestEntryDate: entry.entryDate,
      latestOccurredAt: entry.occurredAt ?? entry.createdAt,
      latestValues: entry.values,
    );
  }

  HabitTrackerTeamSummary _patchTeamSummary(
    HabitTrackerTeamSummary summary,
    double entryValue, {
    required double previousCurrentPeriod,
    required double nextCurrentPeriod,
  }) {
    final delta = nextCurrentPeriod - previousCurrentPeriod;
    return summary.copyWith(
      totalEntries: summary.totalEntries + 1,
      totalValue: summary.totalValue + delta,
    );
  }

  double _primaryEntryValue(HabitTracker tracker, HabitTrackerEntry entry) {
    if (entry.primaryValue != null) {
      return entry.primaryValue!;
    }

    final rawValue = entry.values[tracker.primaryMetricKey];
    if (rawValue is num) {
      return rawValue.toDouble();
    }
    if (rawValue is bool) {
      return rawValue ? 1 : 0;
    }
    return 0;
  }

  bool _entryAffectsCurrentPeriod(
    HabitTracker tracker,
    HabitTrackerEntry entry,
  ) {
    final entryDate = DateTime.tryParse(entry.entryDate);
    if (entryDate == null) {
      return false;
    }

    final now = DateTime.now();
    final current = DateTime(now.year, now.month, now.day);
    final candidate = DateTime(entryDate.year, entryDate.month, entryDate.day);

    switch (tracker.targetPeriod) {
      case HabitTrackerTargetPeriod.daily:
        return candidate == current;
      case HabitTrackerTargetPeriod.weekly:
        final startOfWeek = current.subtract(
          Duration(days: current.weekday - DateTime.monday),
        );
        final endOfWeek = startOfWeek.add(const Duration(days: 6));
        return !candidate.isBefore(startOfWeek) &&
            !candidate.isAfter(endOfWeek);
    }
  }

  double _applyAggregation({
    required double currentValue,
    required double entryValue,
    required HabitTrackerAggregationStrategy strategy,
  }) {
    return switch (strategy) {
      HabitTrackerAggregationStrategy.max =>
        entryValue > currentValue ? entryValue : currentValue,
      HabitTrackerAggregationStrategy.countEntries => currentValue + 1,
      HabitTrackerAggregationStrategy.booleanAny =>
        (currentValue > 0 || entryValue > 0) ? 1 : 0,
      HabitTrackerAggregationStrategy.sum => currentValue + entryValue,
    };
  }
}
