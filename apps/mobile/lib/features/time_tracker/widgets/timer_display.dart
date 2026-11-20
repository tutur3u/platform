import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/time_tracker/cubit/time_tracker_state.dart';
import 'package:mobile/l10n/l10n.dart';

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
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final tone = isPaused
        ? AppTone.warning
        : isRunning
        ? AppTone.primary
        : AppTone.neutral;
    final status = isPaused
        ? l10n.timerPaused
        : isRunning
        ? l10n.timerRunning
        : l10n.timerStopped;
    final statusIcon = isPaused
        ? LucideIcons.pause
        : isRunning
        ? LucideIcons.play
        : LucideIcons.timer;

    final hours = elapsed.inHours.toString().padLeft(2, '0');
    final minutes = (elapsed.inMinutes % 60).toString().padLeft(2, '0');
    final seconds = (elapsed.inSeconds % 60).toString().padLeft(2, '0');

    return AppCard(
      fillColor: isPaused || isRunning ? tone.fill(colors) : colors.card,
      borderColor: colors.border,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.xl,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: AppBadge.outline(
              leading: Icon(statusIcon),
              child: Text(status),
            ),
          ),
          const AppGap(AppSpacing.md),
          Center(
            child: FittedBox(
              fit: BoxFit.scaleDown,
              child: Text(
                '$hours:$minutes:$seconds',
                style: tokens.typography.h1.copyWith(
                  color: colors.foreground,
                  fontSize: 62,
                  fontWeight: FontWeight.w500,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
          if (pomodoroPhase != PomodoroPhase.idle) ...[
            const AppGap(AppSpacing.md),
            Center(child: AppBadge(child: Text(_phaseLabel(context)))),
          ],
        ],
      ),
    );
  }

  String _phaseLabel(BuildContext context) {
    return switch (pomodoroPhase) {
      PomodoroPhase.focus => context.l10n.timerFocusTime,
      PomodoroPhase.shortBreak => context.l10n.timerShortBreak,
      PomodoroPhase.longBreak => context.l10n.timerLongBreak,
      PomodoroPhase.idle => '',
    };
  }
}
