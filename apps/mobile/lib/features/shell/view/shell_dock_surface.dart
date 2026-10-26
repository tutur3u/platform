import 'package:flutter/material.dart';
import 'package:mobile/core/theme/appearance/glass_effects.dart';

/// Shared glass material for the persistent dock and contextual sheets.
///
/// The live blur follows [GlassEffects]; without it the fill is near-opaque.
class ShellDockSurface extends StatelessWidget {
  const ShellDockSurface({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return ClipRRect(
      borderRadius: BorderRadius.circular(26),
      child: GlassBlur(
        sigma: 24,
        child: Container(
          decoration: BoxDecoration(
            color: colors.surface.withValues(
              alpha: GlassEffects.fillAlpha(context, 0.72),
            ),
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
