import 'package:flutter/material.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class TimerControls extends StatelessWidget {
  const TimerControls({
    required this.isRunning,
    required this.isPaused,
    required this.onStart,
    required this.onStop,
    required this.onPause,
    required this.onResume,
    this.areActionButtonsDisabled = false,
    this.isPauseLoading = false,
    this.isStopLoading = false,
    this.isResumeLoading = false,
    super.key,
  });

  final bool isRunning;
  final bool isPaused;
  final VoidCallback onStart;
  final VoidCallback onStop;
  final VoidCallback onPause;
  final VoidCallback onResume;
  final bool areActionButtonsDisabled;
  final bool isPauseLoading;
  final bool isStopLoading;
  final bool isResumeLoading;

  @override
  Widget build(BuildContext context) {
    final double primarySize = responsiveValue(
      context,
      compact: 72,
      medium: 80,
      expanded: 88,
    );
    final primaryIconSize = primarySize / 2;

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
                onPressed: areActionButtonsDisabled ? null : onStart,
                size: primarySize,
                iconSize: primaryIconSize,
                isLoading: isStopLoading,
              )
            else if (isRunning) ...[
              // Running state: Pause + Stop (same diameter so they align)
              _CircleButton(
                icon: shad.LucideIcons.pause,
                onPressed: areActionButtonsDisabled ? null : onPause,
                size: primarySize,
                iconSize: primaryIconSize,
                secondary: true,
                isLoading: isPauseLoading,
              ),
              const shad.Gap(24),
              _CircleButton(
                icon: shad.LucideIcons.square,
                onPressed: areActionButtonsDisabled ? null : onStop,
                size: primarySize,
                iconSize: primaryIconSize,
                destructive: true,
                isLoading: isStopLoading,
              ),
            ] else ...[
              // Paused state: Resume + Stop (same diameter so they align)
              _CircleButton(
                icon: shad.LucideIcons.play,
                onPressed: areActionButtonsDisabled ? null : onResume,
                size: primarySize,
                iconSize: primaryIconSize,
                isLoading: isResumeLoading,
              ),
              const shad.Gap(24),
              _CircleButton(
                icon: shad.LucideIcons.square,
                onPressed: areActionButtonsDisabled ? null : onStop,
                size: primarySize,
                iconSize: primaryIconSize,
                destructive: true,
                isLoading: isStopLoading,
              ),
            ],
          ],
        ),
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
    this.isLoading = false,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final double size;
  final double iconSize;
  final bool destructive;
  final bool secondary;
  final bool isLoading;

  Widget _buildChild() {
    if (isLoading) {
      return SizedBox(
        width: iconSize,
        height: iconSize,
        child: const CircularProgressIndicator(strokeWidth: 2.5),
      );
    }
    return Icon(icon, size: iconSize);
  }

  @override
  Widget build(BuildContext context) {
    if (destructive) {
      return SizedBox(
        width: size,
        height: size,
        child: shad.DestructiveButton(
          onPressed: onPressed,
          shape: shad.ButtonShape.circle,
          child: _buildChild(),
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
          child: _buildChild(),
        ),
      );
    }
    return SizedBox(
      width: size,
      height: size,
      child: shad.PrimaryButton(
        onPressed: onPressed,
        shape: shad.ButtonShape.circle,
        child: _buildChild(),
      ),
    );
  }
}
