import 'package:equatable/equatable.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';

export 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart'
    show PomodoroPhase;

/// The tag on every focus session the Pomodoro starts, so Focus Time can
/// count Pomodoro focus only.
const pomodoroSessionTag = 'pomodoro';

/// A span in which a focus phase ran; `end` is null while it runs.
typedef PomodoroRun = ({DateTime start, DateTime? end});

/// The device's Pomodoro: one phase at a time, counting down to [deadline]
/// while running, or holding [remaining] while paused or waiting to start.
///
/// Focus phases are ordinary time-tracking sessions ([sessionId]); breaks
/// are not tracked work. Single-device by design: the countdown lives on this
/// device and is not shared with other clients.
class PomodoroState extends Equatable {
  const PomodoroState({
    this.phase = PomodoroPhase.idle,
    this.deadline,
    this.remaining = Duration.zero,
    this.completedFocus = 0,
    this.userId,
    this.wsId,
    this.sessionId,
    this.taskId,
    this.taskName,
    this.title,
    this.runs = const [],
  });

  factory PomodoroState.fromJson(Map<String, dynamic> json) {
    final phase = PomodoroPhase.values
        .where((value) => value.name == json['phase'])
        .firstOrNull;
    final deadline = DateTime.tryParse(json['deadline'] as String? ?? '');
    final remaining = json['remainingMs'];
    return PomodoroState(
      phase: phase ?? PomodoroPhase.idle,
      deadline: deadline,
      remaining: Duration(milliseconds: remaining is int ? remaining : 0),
      completedFocus: json['completedFocus'] as int? ?? 0,
      userId: json['userId'] as String?,
      wsId: json['wsId'] as String?,
      sessionId: json['sessionId'] as String?,
      taskId: json['taskId'] as String?,
      taskName: json['taskName'] as String?,
      title: json['title'] as String?,
      runs: _runsFromJson(json),
    );
  }

  /// Runs from a stored payload. Payloads saved before runs existed kept a
  /// single `startedAt` and `pausedAt`; they become one run (open while the
  /// phase was running), so a phase in progress across the app upgrade
  /// still matches sessions by time window.
  static List<PomodoroRun> _runsFromJson(Map<String, dynamic> json) {
    final stored = json['runs'];
    if (stored is List) {
      return [
        for (final run in stored)
          if (run is Map<String, dynamic>)
            if (DateTime.tryParse(run['start'] as String? ?? '')
                case final start?)
              (
                start: start,
                end: DateTime.tryParse(run['end'] as String? ?? ''),
              ),
      ];
    }
    final legacyStart = DateTime.tryParse(json['startedAt'] as String? ?? '');
    if (legacyStart == null) return const [];
    return [
      (
        start: legacyStart,
        end: DateTime.tryParse(json['pausedAt'] as String? ?? ''),
      ),
    ];
  }

  final PomodoroPhase phase;
  final DateTime? deadline;
  final Duration remaining;
  final int completedFocus;
  final String? userId;
  final String? wsId;
  final String? sessionId;
  final String? taskId;
  final String? taskName;
  final String? title;

  /// The spans in which the current focus phase actually ran: one per start
  /// or resume, closed by each pause. The open run ends at [deadline].
  final List<PomodoroRun> runs;

  /// Whether a session starting at [time] started while this focus phase
  /// was running, so never during a pause or after the phase ended.
  bool ranAt(DateTime time) => runs.any((run) {
    final end = run.end ?? deadline;
    return end != null && !time.isBefore(run.start) && time.isBefore(end);
  });

  /// Opens a run at [at] (a start or resume).
  List<PomodoroRun> runsOpenedAt(DateTime at) => [
    for (final run in runs)
      if (run.end != null) run,
    (start: at, end: null),
  ];

  /// Closes the open run at [at] (a pause).
  List<PomodoroRun> runsClosedAt(DateTime at) => [
    for (final run in runs)
      if (run.end == null) (start: run.start, end: at) else run,
  ];

  bool get isIdle => phase == PomodoroPhase.idle;
  bool get isRunning => !isIdle && deadline != null;
  bool get isPaused => !isIdle && deadline == null;
  bool get isFocus => phase == PomodoroPhase.focus;

  /// Time left in the phase at [now].
  Duration remainingAt(DateTime now) {
    final deadline = this.deadline;
    if (deadline == null) return remaining;
    final left = deadline.difference(now);
    return left.isNegative ? Duration.zero : left;
  }

  PomodoroState copyWith({
    PomodoroPhase? phase,
    DateTime? Function()? deadline,
    Duration? remaining,
    int? completedFocus,
    String? Function()? sessionId,
    List<PomodoroRun>? runs,
  }) => PomodoroState(
    phase: phase ?? this.phase,
    deadline: deadline == null ? this.deadline : deadline(),
    remaining: remaining ?? this.remaining,
    completedFocus: completedFocus ?? this.completedFocus,
    userId: userId,
    wsId: wsId,
    sessionId: sessionId == null ? this.sessionId : sessionId(),
    taskId: taskId,
    taskName: taskName,
    title: title,
    runs: runs ?? this.runs,
  );

  Map<String, Object?> toJson() => {
    'phase': phase.name,
    'deadline': deadline?.toUtc().toIso8601String(),
    'remainingMs': remaining.inMilliseconds,
    'completedFocus': completedFocus,
    'userId': userId,
    'wsId': wsId,
    'sessionId': sessionId,
    'taskId': taskId,
    'taskName': taskName,
    'title': title,
    'runs': [
      for (final run in runs)
        {
          'start': run.start.toUtc().toIso8601String(),
          'end': run.end?.toUtc().toIso8601String(),
        },
    ],
  };

  @override
  List<Object?> get props => [
    phase,
    deadline,
    remaining,
    completedFocus,
    userId,
    wsId,
    sessionId,
    taskId,
    taskName,
    title,
    runs,
  ];
}
