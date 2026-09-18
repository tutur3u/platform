import 'package:flutter/material.dart';

class AppCardPalette {
  const AppCardPalette({
    required this.background,
    required this.border,
    required this.shadow,
    required this.iconBackground,
    required this.iconColor,
    required this.textColor,
  });

  // Retains legacy routing hints while resolving a single shared palette.
  // ignore: prefer_constructors_over_static_methods
  static AppCardPalette resolve(
    BuildContext context, {
    required int index,
    String? moduleId,
  }) {
    final colors = Theme.of(context).colorScheme;
    return AppCardPalette(
      background: colors.surfaceContainerLowest,
      border: colors.outlineVariant.withValues(alpha: 0.45),
      shadow: Colors.transparent,
      iconBackground: colors.primary.withValues(alpha: 0.07),
      iconColor: colors.primary,
      textColor: colors.onSurface,
    );
  }

  final Color background;
  final Color border;
  final Color shadow;
  final Color iconBackground;
  final Color iconColor;
  final Color textColor;
}
