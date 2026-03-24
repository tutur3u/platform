import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/time_tracking/break_record.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/goal.dart';
import 'package:mobile/data/models/time_tracking/period_stats.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';

enum TimeTrackerStatus { initial, loading, loaded, error }

enum PomodoroPhase { idle, focus, shortBreak, longBreak }

enum HistoryViewMode { day, week, month }

class TimeTrackerState extends Equatable {
  const TimeTrackerState({
    this.status = TimeTrackerStatus.initial,
    this.runningSession,
    this.activeBreak,
    this.elapsed = Duration.zero,
    this.recentSessions = const [],
    this.categories = const [],
    this.goals = const [],
    this.goalsWorkspaceId,
    this.goalsLoadingByWs = const {},
    this.goalsLoadedByWs = const {},
    this.stats,
    this.selectedCategoryId,
    this.sessionTitle,
    this.sessionDescription,
    this.sessionTaskId,
    this.sessionTaskName,
    this.sessionTaskTicketLabel,
    this.runningSessionTaskName,
    this.runningSessionTaskTicketLabel,
    this.thresholdDays,
    this.pomodoroSettings = const PomodoroSettings(),
    this.pomodoroPhase = PomodoroPhase.idle,
    this.pomodoroSessionCount = 0,
    this.isPaused = false,
    this.historyViewMode = HistoryViewMode.week,
    this.historyAnchorDate,
    this.historySessions = const [],
    this.historyPeriodStats,
    this.historyNextCursor,
    this.historyHasMore = false,
    this.isHistoryLoading = false,
    this.isHistoryLoadingMore = false,
    this.isHistoryStatsAccordionOpen = false,
    this.error,
  });

  final TimeTrackerStatus status;
  final TimeTrackingSession? runningSession;
  final TimeTrackingBreak? activeBreak;
  final Duration elapsed;
  final List<TimeTrackingSession> recentSessions;
  final List<TimeTrackingCategory> categories;
  final List<TimeTrackingGoal> goals;
  final String? goalsWorkspaceId;
  final Map<String, bool> goalsLoadingByWs;
  final Map<String, bool> goalsLoadedByWs;
  final TimeTrackerStats? stats;
  final String? selectedCategoryId;
  final String? sessionTitle;
  final String? sessionDescription;
  final String? sessionTaskId;
  final String? sessionTaskName;
  final String? sessionTaskTicketLabel;

  /// Task display name resolved separately from the running session task ID.
  final String? runningSessionTaskName;

  /// Task ticket label resolved separately from the running session task ID.
  final String? runningSessionTaskTicketLabel;
  final int? thresholdDays;
  final PomodoroSettings pomodoroSettings;
  final PomodoroPhase pomodoroPhase;
  final int pomodoroSessionCount;
  final bool isPaused;
  final HistoryViewMode historyViewMode;
  final DateTime? historyAnchorDate;
  final List<TimeTrackingSession> historySessions;
  final TimeTrackingPeriodStats? historyPeriodStats;
  final String? historyNextCursor;
  final bool historyHasMore;
  final bool isHistoryLoading;
  final bool isHistoryLoadingMore;
  final bool isHistoryStatsAccordionOpen;
  final String? error;

  bool get isRunning => runningSession != null && !isPaused;

  bool get isGoalsLoading =>
      goalsWorkspaceId != null && isGoalsLoadingFor(goalsWorkspaceId!);

  bool get hasLoadedGoals =>
      goalsWorkspaceId != null && hasLoadedGoalsFor(goalsWorkspaceId!);

  bool isGoalsLoadingFor(String wsId) => goalsLoadingByWs[wsId] ?? false;

  bool hasLoadedGoalsFor(String wsId) =>
      goalsWorkspaceId == wsId && (goalsLoadedByWs[wsId] ?? false);

  TimeTrackerState copyWith({
    TimeTrackerStatus? status,
    TimeTrackingSession? runningSession,
    TimeTrackingBreak? activeBreak,
    Duration? elapsed,
    List<TimeTrackingSession>? recentSessions,
    List<TimeTrackingCategory>? categories,
    List<TimeTrackingGoal>? goals,
    Object? goalsWorkspaceId = _sentinel,
    Map<String, bool>? goalsLoadingByWs,
    Map<String, bool>? goalsLoadedByWs,
    TimeTrackerStats? stats,
    String? selectedCategoryId,
    String? sessionTitle,
    String? sessionDescription,
    String? sessionTaskId,
    String? sessionTaskName,
    String? sessionTaskTicketLabel,
    String? runningSessionTaskName,
    String? runningSessionTaskTicketLabel,
    Object? thresholdDays = _sentinel,
    PomodoroSettings? pomodoroSettings,
    PomodoroPhase? pomodoroPhase,
    int? pomodoroSessionCount,
    bool? isPaused,
    HistoryViewMode? historyViewMode,
    Object? historyAnchorDate = _sentinel,
    List<TimeTrackingSession>? historySessions,
    TimeTrackingPeriodStats? historyPeriodStats,
    Object? historyNextCursor = _sentinel,
    bool? historyHasMore,
    bool? isHistoryLoading,
    bool? isHistoryLoadingMore,
    bool? isHistoryStatsAccordionOpen,
    String? error,
    bool clearRunningSession = false,
    bool clearActiveBreak = false,
    bool clearSelectedCategory = false,
    bool clearSessionDescription = false,
    bool clearSessionTaskId = false,
    bool clearSessionTaskMeta = false,
    bool clearRunningSessionTask = false,
    bool clearThresholdDays = false,
    bool clearHistoryPeriodStats = false,
    bool clearHistoryNextCursor = false,
    bool clearGoals = false,
    bool clearGoalsLoaded = false,
    bool clearError = false,
  }) => TimeTrackerState(
    status: status ?? this.status,
    runningSession: clearRunningSession
        ? null
        : (runningSession ?? this.runningSession),
    activeBreak: clearActiveBreak ? null : (activeBreak ?? this.activeBreak),
    elapsed: elapsed ?? this.elapsed,
    recentSessions: recentSessions ?? this.recentSessions,
    categories: categories ?? this.categories,
    goals: clearGoals ? const [] : (goals ?? this.goals),
    goalsWorkspaceId: clearGoals
        ? null
        : (goalsWorkspaceId == _sentinel
              ? this.goalsWorkspaceId
              : goalsWorkspaceId as String?),
    goalsLoadingByWs: goalsLoadingByWs ?? this.goalsLoadingByWs,
    goalsLoadedByWs: clearGoalsLoaded
        ? const {}
        : (goalsLoadedByWs ?? this.goalsLoadedByWs),
    stats: stats ?? this.stats,
    selectedCategoryId: clearSelectedCategory
        ? null
        : (selectedCategoryId ?? this.selectedCategoryId),
    sessionTitle: sessionTitle ?? this.sessionTitle,
    sessionDescription: clearSessionDescription
        ? null
        : (sessionDescription ?? this.sessionDescription),
    sessionTaskId: clearSessionTaskId
        ? null
        : (sessionTaskId ?? this.sessionTaskId),
    sessionTaskName: (clearSessionTaskId || clearSessionTaskMeta)
        ? null
        : (sessionTaskName ?? this.sessionTaskName),
    sessionTaskTicketLabel: (clearSessionTaskId || clearSessionTaskMeta)
        ? null
        : (sessionTaskTicketLabel ?? this.sessionTaskTicketLabel),
    runningSessionTaskName: clearRunningSessionTask
        ? null
        : (runningSessionTaskName ?? this.runningSessionTaskName),
    runningSessionTaskTicketLabel: clearRunningSessionTask
        ? null
        : (runningSessionTaskTicketLabel ?? this.runningSessionTaskTicketLabel),
    thresholdDays: clearThresholdDays
        ? null
        : (thresholdDays == _sentinel
              ? this.thresholdDays
              : thresholdDays as int?),
    pomodoroSettings: pomodoroSettings ?? this.pomodoroSettings,
    pomodoroPhase: pomodoroPhase ?? this.pomodoroPhase,
    pomodoroSessionCount: pomodoroSessionCount ?? this.pomodoroSessionCount,
    isPaused: isPaused ?? this.isPaused,
    historyViewMode: historyViewMode ?? this.historyViewMode,
    historyAnchorDate: historyAnchorDate == _sentinel
        ? this.historyAnchorDate
        : historyAnchorDate as DateTime?,
    historySessions: historySessions ?? this.historySessions,
    historyPeriodStats: clearHistoryPeriodStats
        ? null
        : (historyPeriodStats ?? this.historyPeriodStats),
    historyNextCursor: clearHistoryNextCursor
        ? null
        : (historyNextCursor == _sentinel
              ? this.historyNextCursor
              : historyNextCursor as String?),
    historyHasMore: historyHasMore ?? this.historyHasMore,
    isHistoryLoading: isHistoryLoading ?? this.isHistoryLoading,
    isHistoryLoadingMore: isHistoryLoadingMore ?? this.isHistoryLoadingMore,
    isHistoryStatsAccordionOpen:
        isHistoryStatsAccordionOpen ?? this.isHistoryStatsAccordionOpen,
    error: clearError ? null : (error ?? this.error),
  );

  @override
  List<Object?> get props => [
    status,
    runningSession,
    activeBreak,
    elapsed,
    recentSessions,
    categories,
    goals,
    goalsWorkspaceId,
    goalsLoadingByWs,
    goalsLoadedByWs,
    stats,
    selectedCategoryId,
    sessionTitle,
    sessionDescription,
    sessionTaskId,
    sessionTaskName,
    sessionTaskTicketLabel,
    runningSessionTaskName,
    runningSessionTaskTicketLabel,
    thresholdDays,
    pomodoroSettings,
    pomodoroPhase,
    pomodoroSessionCount,
    isPaused,
    historyViewMode,
    historyAnchorDate,
    historySessions,
    historyPeriodStats,
    historyNextCursor,
    historyHasMore,
    isHistoryLoading,
    isHistoryLoadingMore,
    isHistoryStatsAccordionOpen,
    error,
  ];
}

const _sentinel = Object();
