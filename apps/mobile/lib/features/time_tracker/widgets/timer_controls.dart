import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (!isRunning && !isPaused)
              // Stopped state: Start button
              _CircleButton(
                icon: shad.LucideIcons.play,
                onPressed: onStart,
                size: 72,
                iconSize: 36,
              )
            else if (isRunning) ...[
              // Running state: Pause + Stop
              _CircleButton(
                icon: shad.LucideIcons.pause,
                onPressed: onPause,
                size: 56,
                iconSize: 28,
                secondary: true,
              ),
              const shad.Gap(24),
              _CircleButton(
                icon: shad.LucideIcons.square,
                onPressed: onStop,
                size: 72,
                iconSize: 36,
                destructive: true,
              ),
            ] else ...[
              // Paused state: Resume + Stop
              _CircleButton(
                icon: shad.LucideIcons.play,
                onPressed: onResume,
                size: 56,
                iconSize: 28,
              ),
              const shad.Gap(24),
              _CircleButton(
                icon: shad.LucideIcons.square,
                onPressed: onStop,
                size: 72,
                iconSize: 36,
                destructive: true,
              ),
            ],
          ],
        ),
        if (!isRunning && !isPaused) ...[
          const shad.Gap(16),
          shad.GhostButton(
            onPressed: onAddMissedEntry,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(shad.LucideIcons.plus, size: 18),
                const shad.Gap(8),
                Text(l10n.timerAddMissedEntry),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _CircleButton extends StatelessWidget {
  const _CircleButton({
    required this.icon,
    required this.onPressed,
    required this.size,
    required this.iconSize,
    this.destructive = false,
    this.secondary = false,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final double size;
  final double iconSize;
  final bool destructive;
  final bool secondary;

  @override
  Widget build(BuildContext context) {
    if (destructive) {
      return SizedBox(
        width: size,
        height: size,
        child: shad.DestructiveButton(
          onPressed: onPressed,
          shape: shad.ButtonShape.circle,
          child: Icon(icon, size: iconSize),
        ),
      );
    }
    if (secondary) {
      return SizedBox(
        width: size,
        height: size,
        child: shad.SecondaryButton(
          onPressed: onPressed,
          shape: shad.ButtonShape.circle,
          child: Icon(icon, size: iconSize),
        ),
      );
    }
    return SizedBox(
      width: size,
      height: size,
      child: shad.PrimaryButton(
        onPressed: onPressed,
        shape: shad.ButtonShape.circle,
        child: Icon(icon, size: iconSize),
      ),
    );
  }
}
