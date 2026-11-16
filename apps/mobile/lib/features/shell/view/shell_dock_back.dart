import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/shell/view/shell_chrome_style.dart';
import 'package:mobile/features/shell/view/shell_dock_bar.dart';

/// The dock's 52dp Back circle; long-press returns to the destination root.
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
  Widget build(BuildContext context) => Semantics(
    key: entry.key,
    container: true,
    button: true,
    label: entry.label,
    excludeSemantics: true,
    onTap: onTap,
    onLongPress: onLongPress,
    child: ShellPressShift(
      onTap: onTap,
      onLongPress: onLongPress,
      child: Container(
        key: const ValueKey('shell-dock-back'),
        width: ShellDockMetrics.slot,
        height: ShellDockMetrics.slot,
        decoration: ShapeDecoration(
          color: style.accent,
          shape: const CircleBorder(),
        ),
        child: Icon(AppIcons.back, size: 24, color: style.foreground),
      ),
    ),
  );
}

/// Moves a pressed control down 1dp, the shared press feedback.
class ShellPressShift extends StatefulWidget {
  const ShellPressShift({
    required this.child,
    this.onTap,
    this.onLongPress,
    super.key,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  @override
  State<ShellPressShift> createState() => _ShellPressShiftState();
}

class _ShellPressShiftState extends State<ShellPressShift> {
  bool _pressed = false;

  void _set(bool pressed) {
    if (_pressed != pressed) setState(() => _pressed = pressed);
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    behavior: HitTestBehavior.opaque,
    onTapDown: widget.onTap == null ? null : (_) => _set(true),
    onTapUp: (_) => _set(false),
    onTapCancel: () => _set(false),
    onTap: widget.onTap,
    onLongPress: widget.onLongPress == null
        ? null
        : () {
            _set(false);
            unawaited(AppHaptics.selection());
            widget.onLongPress!();
          },
    child: Transform.translate(
      offset: Offset(0, _pressed ? 1 : 0),
      child: widget.child,
    ),
  );
}
