import 'package:flutter/material.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TimerDisplay extends StatelessWidget {
  const TimerDisplay({
    required this.elapsed,
    required this.isRunning,
    required this.isPaused,
    required this.pomodoroPhase,
    super.key,
  });

  final Duration elapsed;
  final bool isRunning;
  final bool isPaused;
  final PomodoroPhase pomodoroPhase;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    final color = isPaused
        ? theme.colorScheme.destructive
        : isRunning
        ? theme.colorScheme.primary
        : theme.colorScheme.foreground;

    final hours = elapsed.inHours.toString().padLeft(2, '0');
    final minutes = (elapsed.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (elapsed.inSeconds % 60).toString().padLeft(2, '0');

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (pomodoroPhase != PomodoroPhase.idle)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: shad.OutlineBadge(
              child: Text(
                _phaseLabel(context),
                style: theme.typography.small.copyWith(
                  color: _phaseColor(theme.colorScheme),
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        Text(
          '$hours:$minutes:$seconds',
          style: theme.typography.h1.copyWith(
            fontWeight: FontWeight.w300,
            fontSize: 64,
            color: color,
            fontFeatures: [const FontFeature.tabularFigures()],
          ),
        ),
      ],
    );
  }

  String _phaseLabel(BuildContext context) {
    return switch (pomodoroPhase) {
      PomodoroPhase.focus => 'Focus',
      PomodoroPhase.shortBreak => 'Short Break',
      PomodoroPhase.longBreak => 'Long Break',
      PomodoroPhase.idle => '',
    };
  }

  Color _phaseColor(shad.ColorScheme colorScheme) {
    return switch (pomodoroPhase) {
      PomodoroPhase.focus => colorScheme.primary,
      PomodoroPhase.shortBreak => colorScheme.secondary,
      PomodoroPhase.longBreak => colorScheme.secondary,
      PomodoroPhase.idle => colorScheme.foreground,
    };
  }
}
