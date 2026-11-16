import 'package:mobile/data/models/habit_tracker.dart';
import 'package:mobile/data/repositories/habit_tracker_repository.dart';

import '../store_screenshot_app.dart';
import 'store_team.dart';

/// One habit the team keeps through launch week.
class _Habit {
  const _Habit({
    required this.id,
    required this.en,
    required this.vi,
    required this.color,
    required this.icon,
    required this.unitEn,
    required this.unitVi,
    required this.target,
    required this.today,
    required this.streak,
    required this.best,
    required this.teamTotal,
    required this.teamStreak,
    this.mode = HabitTrackerComposerMode.quickIncrement,
    this.period = HabitTrackerTargetPeriod.daily,
    this.loggedAt,
  });

  final String id;
  final String en;
  final String vi;
  final String color;
  final String icon;
  final String unitEn;
  final String unitVi;
  final double target;
  final double today;
  final int streak;
  final int best;
  final double teamTotal;
  final int teamStreak;
  final HabitTrackerComposerMode mode;
  final HabitTrackerTargetPeriod period;

  /// Hour of today's last check-in; null shows the streak instead.
  final (int, int)? loggedAt;
}

const _habits = <_Habit>[
  _Habit(
    id: 'water',
    en: 'Drink water',
    vi: 'Uống đủ nước',
    color: 'CYAN',
    icon: 'Droplets',
    unitEn: 'glasses',
    unitVi: 'ly',
    target: 8,
    today: 6,
    streak: 12,
    best: 19,
    teamTotal: 27,
    teamStreak: 23,
    loggedAt: (15, 40),
  ),
  _Habit(
    id: 'deep-work',
    en: 'Deep work',
    vi: 'Làm việc tập trung',
    color: 'INDIGO',
    icon: 'Code2',
    unitEn: 'hours',
    unitVi: 'giờ',
    target: 4,
    today: 3,
    streak: 15,
    best: 21,
    teamTotal: 14,
    teamStreak: 15,
  ),
  _Habit(
    id: 'reading',
    en: 'Read before bed',
    vi: 'Đọc sách trước khi ngủ',
    color: 'ORANGE',
    icon: 'BookOpen',
    unitEn: 'pages',
    unitVi: 'trang',
    target: 20,
    today: 20,
    streak: 21,
    best: 34,
    teamTotal: 86,
    teamStreak: 34,
  ),
  _Habit(
    id: 'steps',
    en: 'Morning walk',
    vi: 'Đi bộ buổi sáng',
    color: 'GREEN',
    icon: 'Footprints',
    unitEn: 'steps',
    unitVi: 'bước',
    target: 8000,
    today: 6400,
    streak: 9,
    best: 26,
    teamTotal: 31200,
    teamStreak: 26,
    loggedAt: (8, 15),
  ),
  _Habit(
    id: 'gym',
    en: 'Strength training',
    vi: 'Tập sức mạnh',
    color: 'RED',
    icon: 'Dumbbell',
    unitEn: 'sessions',
    unitVi: 'buổi',
    target: 4,
    today: 3,
    streak: 6,
    best: 11,
    teamTotal: 13,
    teamStreak: 11,
    mode: HabitTrackerComposerMode.workoutSession,
    period: HabitTrackerTargetPeriod.weekly,
  ),
  _Habit(
    id: 'sketch',
    en: 'Daily sketch',
    vi: 'Phác thảo mỗi ngày',
    color: 'PINK',
    icon: 'Flame',
    unitEn: 'sketches',
    unitVi: 'bản',
    target: 1,
    today: 1,
    streak: 30,
    best: 30,
    teamTotal: 4,
    teamStreak: 30,
    mode: HabitTrackerComposerMode.quickCheck,
  ),
];

HabitTracker _tracker(_Habit habit, StoreLocale locale) {
  final created = StoreTeam.at(9, 0, -60);
  return HabitTracker(
    id: 'store-habit-${habit.id}',
    wsId: StoreTeam.workspaceId,
    name: locale.pick(habit.en, habit.vi),
    color: habit.color,
    icon: habit.icon,
    trackingMode: HabitTrackerTrackingMode.eventLog,
    targetPeriod: habit.period,
    targetOperator: HabitTrackerTargetOperator.gte,
    targetValue: habit.target,
    primaryMetricKey: 'value',
    aggregationStrategy: HabitTrackerAggregationStrategy.sum,
    inputSchema: [
      HabitTrackerFieldSchema(
        key: 'value',
        label: locale.pick(habit.en, habit.vi),
        type: HabitTrackerFieldType.number,
        required: true,
        unit: locale.pick(habit.unitEn, habit.unitVi),
      ),
    ],
    quickAddValues: const [1, 2, 3],
    freezeAllowance: 2,
    recoveryWindowPeriods: 1,
    startDate: created.toIso8601String().substring(0, 10),
    isActive: true,
    createdAt: created,
    updatedAt: StoreTeam.at(8),
    composerMode: habit.mode,
    createdBy: StoreTeam.me.id,
  );
}

HabitTrackerMemberSummary _mine(_Habit habit) {
  final logged = habit.loggedAt;
  return HabitTrackerMemberSummary(
    member: HabitTrackerMember(
      userId: StoreTeam.me.id,
      displayName: StoreTeam.me.name,
    ),
    total: habit.today * habit.best,
    entryCount: habit.best * 2,
    currentPeriodTotal: habit.today,
    latestOccurredAt: logged == null
        ? null
        : StoreTeam.at(logged.$1, logged.$2).toUtc(),
    streak: HabitTrackerStreakSummary(
      currentStreak: habit.streak,
      bestStreak: habit.best,
      freezeCount: 2,
      freezesUsed: 0,
      perfectWeekCount: habit.streak ~/ 7,
      consistencyRate: 0.86,
      recoveryWindow: const HabitTrackerRecoveryWindowState(eligible: false),
    ),
  );
}

/// The team's habit trackers, each with today's progress and streak.
List<HabitTrackerCardSummary> storeHabitSummaries(StoreLocale locale) => [
  for (final habit in _habits)
    HabitTrackerCardSummary(
      tracker: _tracker(habit, locale),
      currentMember: _mine(habit),
      team: HabitTrackerTeamSummary(
        activeMembers: StoreTeam.members.length,
        totalEntries: habit.best * 6,
        totalValue: habit.teamTotal,
        averageConsistencyRate: 0.81,
        topStreak: habit.teamStreak,
      ),
      leaderboard: const [],
    ),
];

/// Serves the launch-week habit trackers; writes succeed without effect.
class StoreHabitRepository implements IHabitTrackerRepository {
  StoreHabitRepository(this.locale);

  final StoreLocale locale;

  @override
  Future<HabitTrackerListResponse> listTrackers(
    String wsId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
    bool requireFresh = false,
  }) async => HabitTrackerListResponse(
    trackers: storeHabitSummaries(locale),
    members: [
      for (final person in StoreTeam.members)
        HabitTrackerMember(userId: person.id, displayName: person.name),
    ],
    scope: scope,
    viewerUserId: StoreTeam.me.id,
    scopeUserId: userId,
  );

  @override
  Future<HabitTrackerDetailResponse> getTrackerDetail(
    String wsId,
    String trackerId, {
    HabitTrackerScope scope = HabitTrackerScope.self,
    String? userId,
    bool requireFresh = false,
  }) async {
    final summary = storeHabitSummaries(
      locale,
    ).firstWhere((item) => item.tracker.id == trackerId);
    return HabitTrackerDetailResponse(
      tracker: summary.tracker,
      entries: const [],
      currentMember: summary.currentMember,
      team: summary.team,
      memberSummaries: const [],
      leaderboard: const [],
      currentPeriodMetrics: const [],
    );
  }

  @override
  Future<HabitTracker> createTracker(String wsId, HabitTrackerInput input) =>
      throw UnsupportedError('Store fixture is read-only');

  @override
  Future<HabitTracker> updateTracker(
    String wsId,
    String trackerId,
    HabitTrackerInput input,
  ) => throw UnsupportedError('Store fixture is read-only');

  @override
  Future<void> archiveTracker(String wsId, String trackerId) async {}

  @override
  Future<HabitTrackerEntry> createEntry(
    String wsId,
    String trackerId,
    HabitTrackerEntryInput input,
  ) => throw UnsupportedError('Store fixture is read-only');

  @override
  Future<void> deleteEntry(
    String wsId,
    String trackerId,
    String entryId,
  ) async {}

  @override
  Future<void> createStreakAction(
    String wsId,
    String trackerId,
    HabitTrackerStreakActionInput input,
  ) async {}
}
