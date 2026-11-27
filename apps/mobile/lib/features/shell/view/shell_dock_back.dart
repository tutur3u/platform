import 'package:flutter/material.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/components/app_tooltip.dart';
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
    final tap = entry.enabled ? onTap : null;
    final longPress = entry.enabled ? onLongPress : null;
    return Semantics(
      key: entry.key,
      container: true,
      button: true,
      enabled: entry.enabled,
      label: entry.label,
      excludeSemantics: true,
      onTap: tap,
      onLongPress: longPress,
      child: AppTooltip(
        message: entry.label,
        triggerMode: longPress == null
            ? TooltipTriggerMode.longPress
            : TooltipTriggerMode.manual,
        excludeFromSemantics: true,
        child: ShellDockControl(
          borderRadius: radius,
          onTap: tap,
          onLongPress: longPress,
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
