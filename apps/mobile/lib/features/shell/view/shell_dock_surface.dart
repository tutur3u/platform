import 'dart:ui';

import 'package:flutter/material.dart';

/// Shared glass material for the persistent dock and contextual sheets.
class ShellDockSurface extends StatelessWidget {
  const ShellDockSurface({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          decoration: BoxDecoration(
            color: colors.surface.withValues(alpha: solid ? 1 : 0.72),
            borderRadius: BorderRadius.circular(26),
            border: Border.all(
              color: colors.outlineVariant.withValues(alpha: 0.4),
            ),
          ),
          child: Material(color: Colors.transparent, child: child),
        ),
      ),
    );
  }
}
