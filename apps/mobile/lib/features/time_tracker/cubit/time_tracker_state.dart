import 'package:equatable/equatable.dart';
import 'package:mobile/data/models/time_tracking/break_record.dart';
import 'package:mobile/data/models/time_tracking/category.dart';
import 'package:mobile/data/models/time_tracking/pomodoro_settings.dart';
import 'package:mobile/data/models/time_tracking/session.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';

enum TimeTrackerStatus { initial, loading, loaded, error }

enum PomodoroPhase { idle, focus, shortBreak, longBreak }

class TimeTrackerState extends Equatable {
  const TimeTrackerState({
    this.status = TimeTrackerStatus.initial,
    this.runningSession,
    this.activeBreak,
    this.elapsed = Duration.zero,
    this.recentSessions = const [],
    this.categories = const [],
    this.stats,
    this.selectedCategoryId,
    this.sessionTitle,
    this.pomodoroSettings = const PomodoroSettings(),
    this.pomodoroPhase = PomodoroPhase.idle,
    this.pomodoroSessionCount = 0,
    this.isPaused = false,
    this.error,
  });

  final TimeTrackerStatus status;
  final TimeTrackingSession? runningSession;
  final TimeTrackingBreak? activeBreak;
  final Duration elapsed;
  final List<TimeTrackingSession> recentSessions;
  final List<TimeTrackingCategory> categories;
  final TimeTrackerStats? stats;
  final String? selectedCategoryId;
  final String? sessionTitle;
  final PomodoroSettings pomodoroSettings;
  final PomodoroPhase pomodoroPhase;
  final int pomodoroSessionCount;
  final bool isPaused;
  final String? error;

  bool get isRunning => runningSession != null && !isPaused;

  TimeTrackerState copyWith({
    TimeTrackerStatus? status,
    TimeTrackingSession? runningSession,
    TimeTrackingBreak? activeBreak,
    Duration? elapsed,
    List<TimeTrackingSession>? recentSessions,
    List<TimeTrackingCategory>? categories,
    TimeTrackerStats? stats,
    String? selectedCategoryId,
    String? sessionTitle,
    PomodoroSettings? pomodoroSettings,
    PomodoroPhase? pomodoroPhase,
    int? pomodoroSessionCount,
    bool? isPaused,
    String? error,
    bool clearRunningSession = false,
    bool clearActiveBreak = false,
    bool clearSelectedCategory = false,
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
    stats: stats ?? this.stats,
    selectedCategoryId: clearSelectedCategory
        ? null
        : (selectedCategoryId ?? this.selectedCategoryId),
    sessionTitle: sessionTitle ?? this.sessionTitle,
    pomodoroSettings: pomodoroSettings ?? this.pomodoroSettings,
    pomodoroPhase: pomodoroPhase ?? this.pomodoroPhase,
    pomodoroSessionCount: pomodoroSessionCount ?? this.pomodoroSessionCount,
    isPaused: isPaused ?? this.isPaused,
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
    stats,
    selectedCategoryId,
    sessionTitle,
    pomodoroSettings,
    pomodoroPhase,
    pomodoroSessionCount,
    isPaused,
    error,
  ];
}
