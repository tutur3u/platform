part of 'habits_cubit.dart';

Map<String, dynamic> _stateToCacheJson(HabitsState state) {
  return {
    'status': state.status.name,
    'activeWorkspaceId': state.activeWorkspaceId,
    'selectedTrackerId': state.selectedTrackerId,
    'selectedScope': state.selectedScope.apiValue,
    'selectedMemberId': state.selectedMemberId,
    'searchQuery': state.searchQuery,
    'quickLogDrafts': state.quickLogDrafts,
    'listResponse': state.listResponse == null
        ? null
        : _listResponseToJson(state.listResponse!),
  };
}

HabitsState _stateFromCacheJson(Map<String, dynamic> json) {
  return HabitsState(
    status: _statusFromJson(json['status']),
    activeWorkspaceId: json['activeWorkspaceId'] as String?,
    selectedTrackerId: json['selectedTrackerId'] as String?,
    selectedScope: habitTrackerScopeFromJson(json['selectedScope']),
    selectedMemberId: json['selectedMemberId'] as String?,
    searchQuery: json['searchQuery'] as String? ?? '',
    quickLogDrafts: Map<String, String>.from(
      (json['quickLogDrafts'] as Map<dynamic, dynamic>?) ?? const {},
    ),
    listResponse: json['listResponse'] is Map<String, dynamic>
        ? HabitTrackerListResponse.fromJson(
            Map<String, dynamic>.from(json['listResponse'] as Map),
          )
        : null,
  );
}

HabitsStatus _statusFromJson(Object? value) {
  return switch (value) {
    'loaded' => HabitsStatus.loaded,
    'loading' => HabitsStatus.loading,
    'error' => HabitsStatus.error,
    _ => HabitsStatus.initial,
  };
}

Map<String, dynamic> _listResponseToJson(HabitTrackerListResponse response) {
  return {
    'trackers': response.trackers
        .map(_cardSummaryToJson)
        .toList(growable: false),
    'members': response.members.map(_memberToJson).toList(growable: false),
    'scope': response.scope.apiValue,
    'scope_user_id': response.scopeUserId,
    'viewer_user_id': response.viewerUserId,
  };
}

Map<String, dynamic> _cardSummaryToJson(HabitTrackerCardSummary summary) {
  return {
    'tracker': _trackerToJson(summary.tracker),
    'current_member': summary.currentMember == null
        ? null
        : _memberSummaryToJson(summary.currentMember!),
    'team': summary.team == null ? null : _teamSummaryToJson(summary.team!),
    'leaderboard': summary.leaderboard
        .map(_leaderboardRowToJson)
        .toList(growable: false),
  };
}

Map<String, dynamic> _trackerToJson(HabitTracker tracker) {
  return {
    'id': tracker.id,
    'ws_id': tracker.wsId,
    'name': tracker.name,
    'description': tracker.description,
    'color': tracker.color,
    'icon': tracker.icon,
    'tracking_mode': tracker.trackingMode.apiValue,
    'target_period': tracker.targetPeriod.apiValue,
    'target_operator': tracker.targetOperator.apiValue,
    'target_value': tracker.targetValue,
    'primary_metric_key': tracker.primaryMetricKey,
    'aggregation_strategy': tracker.aggregationStrategy.apiValue,
    'input_schema': tracker.inputSchema
        .map((value) => value.toJson())
        .toList(growable: false),
    'quick_add_values': tracker.quickAddValues,
    'freeze_allowance': tracker.freezeAllowance,
    'recovery_window_periods': tracker.recoveryWindowPeriods,
    'start_date': tracker.startDate,
    'created_by': tracker.createdBy,
    'is_active': tracker.isActive,
    'archived_at': tracker.archivedAt?.toIso8601String(),
    'created_at': tracker.createdAt.toIso8601String(),
    'updated_at': tracker.updatedAt.toIso8601String(),
  };
}

Map<String, dynamic> _memberToJson(HabitTrackerMember member) {
  return {
    'user_id': member.userId,
    'workspace_user_id': member.workspaceUserId,
    'display_name': member.displayName,
    'email': member.email,
    'avatar_url': member.avatarUrl,
  };
}

Map<String, dynamic> _memberSummaryToJson(HabitTrackerMemberSummary summary) {
  return {
    'member': _memberToJson(summary.member),
    'total': summary.total,
    'entry_count': summary.entryCount,
    'current_period_total': summary.currentPeriodTotal,
    'streak': _streakSummaryToJson(summary.streak),
  };
}

Map<String, dynamic> _streakSummaryToJson(HabitTrackerStreakSummary streak) {
  return {
    'current_streak': streak.currentStreak,
    'best_streak': streak.bestStreak,
    'last_success_date': streak.lastSuccessDate,
    'freeze_count': streak.freezeCount,
    'freezes_used': streak.freezesUsed,
    'perfect_week_count': streak.perfectWeekCount,
    'consistency_rate': streak.consistencyRate,
    'recovery_window': _recoveryWindowToJson(streak.recoveryWindow),
  };
}

Map<String, dynamic> _recoveryWindowToJson(
  HabitTrackerRecoveryWindowState recoveryWindow,
) {
  return {
    'eligible': recoveryWindow.eligible,
    'period_start': recoveryWindow.periodStart,
    'period_end': recoveryWindow.periodEnd,
    'expires_on': recoveryWindow.expiresOn,
    'action': recoveryWindow.action?.apiValue,
  };
}

Map<String, dynamic> _leaderboardRowToJson(HabitTrackerLeaderboardRow row) {
  return {
    'member': _memberToJson(row.member),
    'current_streak': row.currentStreak,
    'best_streak': row.bestStreak,
    'consistency_rate': row.consistencyRate,
    'current_period_total': row.currentPeriodTotal,
  };
}

Map<String, dynamic> _teamSummaryToJson(HabitTrackerTeamSummary team) {
  return {
    'active_members': team.activeMembers,
    'total_entries': team.totalEntries,
    'total_value': team.totalValue,
    'average_consistency_rate': team.averageConsistencyRate,
    'top_streak': team.topStreak,
  };
}
