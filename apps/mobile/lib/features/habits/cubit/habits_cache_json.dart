part of 'habits_cubit.dart';

Map<String, dynamic> _stateToCacheJson(HabitsState state) {
  return {
    'status': state.status.name,
    'detailStatus': state.detailStatus.name,
    'activityStatus': state.activityStatus.name,
    'activeWorkspaceId': state.activeWorkspaceId,
    'selectedTrackerId': state.selectedTrackerId,
    'selectedScope': state.selectedScope.apiValue,
    'selectedMemberId': state.selectedMemberId,
    'searchQuery': state.searchQuery,
    'quickLogDrafts': state.quickLogDrafts,
    'lastUpdatedAt': state.lastUpdatedAt?.toIso8601String(),
    'detailLastUpdatedAt': state.detailLastUpdatedAt?.toIso8601String(),
    'activityLastUpdatedAt': state.activityLastUpdatedAt?.toIso8601String(),
    'listResponse': state.listResponse == null
        ? null
        : _listResponseToJson(state.listResponse!),
    'detail': state.detail == null ? null : _detailToJson(state.detail!),
    'detailScope': state.detailScope?.apiValue,
    'detailScopeUserId': state.detailScopeUserId,
    'activityEntries': state.activityEntries
        .map(_activityEntryToJson)
        .toList(growable: false),
  };
}

HabitsState _stateFromCacheJson(Map<String, dynamic> json) {
  final detail = json['detail'] is Map<String, dynamic>
      ? HabitTrackerDetailResponse.fromJson(
          Map<String, dynamic>.from(json['detail'] as Map),
        )
      : null;
  final activityEntries =
      (json['activityEntries'] as List?)
          ?.whereType<Map<Object?, Object?>>()
          .map(
            (value) => HabitActivityEntry(
              tracker: HabitTracker.fromJson(
                Map<String, dynamic>.from(
                  (value['tracker'] as Map?) ?? const <String, dynamic>{},
                ),
              ),
              entry: HabitTrackerEntry.fromJson(
                Map<String, dynamic>.from(
                  (value['entry'] as Map?) ?? const <String, dynamic>{},
                ),
              ),
            ),
          )
          .toList(growable: false) ??
      const <HabitActivityEntry>[];

  return HabitsState(
    status: _statusFromJson(json['status']),
    detailStatus: _statusFromJson(json['detailStatus']),
    activityStatus: _statusFromJson(json['activityStatus']),
    isFromCache: true,
    lastUpdatedAt: _dateTimeFromJson(json['lastUpdatedAt']),
    isDetailFromCache: detail != null,
    detailLastUpdatedAt: _dateTimeFromJson(json['detailLastUpdatedAt']),
    isActivityFromCache: activityEntries.isNotEmpty,
    activityLastUpdatedAt: _dateTimeFromJson(json['activityLastUpdatedAt']),
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
    detail: detail,
    detailScope: json['detailScope'] == null
        ? null
        : habitTrackerScopeFromJson(json['detailScope']),
    detailScopeUserId: json['detailScopeUserId'] as String?,
    activityEntries: activityEntries,
  );
}

DateTime? _dateTimeFromJson(Object? value) {
  if (value is! String || value.isEmpty) {
    return null;
  }
  return DateTime.tryParse(value);
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

Map<String, dynamic> _detailToJson(HabitTrackerDetailResponse detail) {
  return {
    'tracker': _trackerToJson(detail.tracker),
    'entries': detail.entries.map(_entryToJson).toList(growable: false),
    'current_member': detail.currentMember == null
        ? null
        : _memberSummaryToJson(detail.currentMember!),
    'team': detail.team == null ? null : _teamSummaryToJson(detail.team!),
    'member_summaries': detail.memberSummaries
        .map(_memberSummaryToJson)
        .toList(growable: false),
    'leaderboard': detail.leaderboard
        .map(_leaderboardRowToJson)
        .toList(growable: false),
    'current_period_metrics': detail.currentPeriodMetrics
        .map(_periodMetricToJson)
        .toList(growable: false),
  };
}

Map<String, dynamic> _activityEntryToJson(HabitActivityEntry entry) {
  return {
    'tracker': _trackerToJson(entry.tracker),
    'entry': _entryToJson(entry.entry),
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
    'use_case': tracker.useCase.apiValue,
    'template_category': tracker.templateCategory.apiValue,
    'composer_mode': tracker.composerMode.apiValue,
    'composer_config': tracker.composerConfig.toJson(),
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

Map<String, dynamic> _entryToJson(HabitTrackerEntry entry) {
  return {
    'id': entry.id,
    'ws_id': entry.wsId,
    'tracker_id': entry.trackerId,
    'user_id': entry.userId,
    'entry_kind': entry.entryKind.apiValue,
    'entry_date': entry.entryDate,
    'occurred_at': entry.occurredAt?.toIso8601String(),
    'values': entry.values.map((key, value) {
      if (value is List<HabitTrackerExerciseBlock>) {
        return MapEntry(
          key,
          value.map((block) => block.toJson()).toList(growable: false),
        );
      }
      return MapEntry(key, value);
    }),
    'primary_value': entry.primaryValue,
    'note': entry.note,
    'tags': entry.tags,
    'created_by': entry.createdBy,
    'created_at': entry.createdAt.toIso8601String(),
    'updated_at': entry.updatedAt.toIso8601String(),
    'member': entry.member == null ? null : _memberToJson(entry.member!),
  };
}

Map<String, dynamic> _memberSummaryToJson(HabitTrackerMemberSummary summary) {
  return {
    'member': _memberToJson(summary.member),
    'total': summary.total,
    'entry_count': summary.entryCount,
    'current_period_total': summary.currentPeriodTotal,
    'latest_value': summary.latestValue,
    'latest_entry_id': summary.latestEntryId,
    'latest_entry_date': summary.latestEntryDate,
    'latest_occurred_at': summary.latestOccurredAt?.toIso8601String(),
    'latest_values': summary.latestValues?.map((key, value) {
      if (value is List<HabitTrackerExerciseBlock>) {
        return MapEntry(
          key,
          value.map((block) => block.toJson()).toList(growable: false),
        );
      }
      return MapEntry(key, value);
    }),
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

Map<String, dynamic> _periodMetricToJson(HabitTrackerPeriodMetric metric) {
  return {
    'period_start': metric.periodStart,
    'period_end': metric.periodEnd,
    'total': metric.total,
    'success': metric.success,
    'used_freeze': metric.usedFreeze,
    'used_repair': metric.usedRepair,
    'entry_count': metric.entryCount,
  };
}
