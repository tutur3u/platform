import 'package:flutter/material.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';

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
    final colorScheme = Theme.of(context).colorScheme;

    final color = isPaused
        ? colorScheme.error
        : isRunning
        ? colorScheme.primary
        : colorScheme.onSurface;

    final hours = elapsed.inHours.toString().padLeft(2, '0');
    final minutes = (elapsed.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (elapsed.inSeconds % 60).toString().padLeft(2, '0');

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (pomodoroPhase != PomodoroPhase.idle)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Chip(
              label: Text(_phaseLabel(context)),
              backgroundColor: _phaseColor(colorScheme).withValues(alpha: 0.15),
              side: BorderSide.none,
              labelStyle: TextStyle(
                color: _phaseColor(colorScheme),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        Text(
          '$hours:$minutes:$seconds',
          style: Theme.of(context).textTheme.displayLarge?.copyWith(
            fontWeight: FontWeight.w300,
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

  Color _phaseColor(ColorScheme colorScheme) {
    return switch (pomodoroPhase) {
      PomodoroPhase.focus => colorScheme.primary,
      PomodoroPhase.shortBreak => colorScheme.tertiary,
      PomodoroPhase.longBreak => colorScheme.secondary,
      PomodoroPhase.idle => colorScheme.onSurface,
    };
  }
}
