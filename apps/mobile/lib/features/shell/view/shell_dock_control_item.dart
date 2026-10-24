import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';

/// Independent actions in the shared navbar;
/// toggles do not select destinations.
class ShellDockControlItem extends StatelessWidget {
  const ShellDockControlItem({
    required this.label,
    required this.icon,
    required this.onPressed,
    this.toggled,
    this.destructive = false,
    super.key,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onPressed;
  final bool? toggled;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Semantics(
      container: true,
      button: true,
      enabled: onPressed != null,
      label: label,
      onTap: onPressed,
      toggled: toggled,
      excludeSemantics: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: toggled == true
              ? colors.onSurface.withValues(alpha: .08)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(21),
        ),
        child: AppIconButton(
          tooltip: label,
          onPressed: onPressed,
          icon: Icon(icon, color: destructive ? colors.error : null, size: 24),
        ),
      ),
    );
  }
}
