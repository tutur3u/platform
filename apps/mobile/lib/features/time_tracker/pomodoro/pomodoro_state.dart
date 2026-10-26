import 'package:equatable/equatable.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';

export 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart'
    show PomodoroPhase;

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
    );
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
  ];
}
