import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_control.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';

/// The dock's Back circle; long-press returns to the destination root.
class ShellDockBack extends StatelessWidget {
  const ShellDockBack({
    required this.entry,
    required this.style,
    required this.onTap,
    this.onLongPress,
    super.key,
  });

  final ShellDockEntry entry;
  final ShellChromeStyle style;
  final VoidCallback onTap;
  final VoidCallback? onLongPress;

  @override
  Widget build(BuildContext context) {
    final radius = ShellDockSurface.innerBorderRadius;
    return Semantics(
      key: entry.key,
      container: true,
      button: true,
      label: entry.label,
      excludeSemantics: true,
      onTap: onTap,
      onLongPress: onLongPress,
      child: Tooltip(
        message: entry.label,
        triggerMode: onLongPress == null
            ? TooltipTriggerMode.longPress
            : TooltipTriggerMode.manual,
        excludeFromSemantics: true,
        child: ShellDockControl(
          borderRadius: radius,
          onTap: onTap,
          onLongPress: onLongPress,
          fill: style.accent,
          child: SizedBox.square(
            key: const ValueKey('shell-dock-back'),
            dimension: ShellDockMetrics.slot,
            child: Icon(AppIcons.back, size: 24, color: style.foreground),
          ),
        ),
      ),
    );
  }
}
