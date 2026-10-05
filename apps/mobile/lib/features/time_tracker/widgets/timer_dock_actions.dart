import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/l10n/l10n.dart';

/// Session controls join the existing shell dock; the page never mounts a bar.
class TimerDockActions extends StatelessWidget {
  const TimerDockActions({
    required this.isRunning,
    required this.isPaused,
    required this.enabled,
    required this.primaryLoading,
    required this.stopLoading,
    required this.onStart,
    required this.onPause,
    required this.onResume,
    required this.onStop,
    super.key,
  });
  final bool isRunning;
  final bool isPaused;
  final bool enabled;
  final bool primaryLoading;
  final bool stopLoading;
  final VoidCallback onStart;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onStop;

  @override
  Widget build(BuildContext context) => ShellChromeActions(
    ownerId: 'timer-session-controls',
    locations: const {Routes.timer},
    actions: [
      ShellActionSpec(
        id: 'timer-session-toggle',
        icon: isRunning ? Icons.pause_rounded : Icons.play_arrow_rounded,
        tooltip: isRunning
            ? context.l10n.timerPause
            : isPaused
            ? context.l10n.timerResume
            : context.l10n.timerStart,
        inDock: true,
        enabled: enabled,
        isLoading: primaryLoading,
        onPressed: isRunning
            ? onPause
            : isPaused
            ? onResume
            : onStart,
      ),
      if (isRunning || isPaused)
        ShellActionSpec(
          id: 'timer-session-stop',
          icon: Icons.stop_rounded,
          tooltip: context.l10n.timerStop,
          inDock: true,
          enabled: enabled,
          isLoading: stopLoading,
          onPressed: onStop,
        ),
    ],
  );
}
