import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class TimerControls extends StatelessWidget {
  const TimerControls({
    required this.isRunning,
    required this.isPaused,
    required this.onStart,
    required this.onStop,
    required this.onPause,
    required this.onResume,
    required this.onAddMissedEntry,
    super.key,
  });

  final bool isRunning;
  final bool isPaused;
  final VoidCallback onStart;
  final VoidCallback onStop;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final VoidCallback onAddMissedEntry;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final colorScheme = Theme.of(context).colorScheme;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (!isRunning && !isPaused)
              // Stopped state: Start button
              _CircleButton(
                icon: Icons.play_arrow,
                color: colorScheme.primary,
                onPressed: onStart,
                size: 72,
                iconSize: 36,
              )
            else if (isRunning) ...[
              // Running state: Pause + Stop
              _CircleButton(
                icon: Icons.pause,
                color: colorScheme.tertiary,
                onPressed: onPause,
                size: 56,
                iconSize: 28,
              ),
              const SizedBox(width: 24),
              _CircleButton(
                icon: Icons.stop,
                color: colorScheme.error,
                onPressed: onStop,
                size: 72,
                iconSize: 36,
              ),
            ] else ...[
              // Paused state: Resume + Stop
              _CircleButton(
                icon: Icons.play_arrow,
                color: colorScheme.primary,
                onPressed: onResume,
                size: 56,
                iconSize: 28,
              ),
              const SizedBox(width: 24),
              _CircleButton(
                icon: Icons.stop,
                color: colorScheme.error,
                onPressed: onStop,
                size: 72,
                iconSize: 36,
              ),
            ],
          ],
        ),
        if (!isRunning && !isPaused) ...[
          const SizedBox(height: 16),
          TextButton.icon(
            onPressed: onAddMissedEntry,
            icon: const Icon(Icons.add, size: 18),
            label: Text(l10n.timerAddMissedEntry),
          ),
        ],
      ],
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({
    required this.icon,
    required this.color,
    required this.onPressed,
    required this.size,
    required this.iconSize,
  });

  final IconData icon;
  final Color color;
  final VoidCallback onPressed;
  final double size;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: FilledButton(
        onPressed: onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: color,
          shape: const CircleBorder(),
          padding: EdgeInsets.zero,
        ),
        child: Icon(icon, size: iconSize),
      ),
    );
  }
}
