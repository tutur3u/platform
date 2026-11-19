import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Colours of one illustration, resolved from the appearance tokens.
@immutable
class AppIllustrationPalette {
  const AppIllustrationPalette({
    required this.backdrop,
    required this.accent,
    required this.onAccent,
    required this.surface,
    required this.outline,
    required this.detail,
  });

  factory AppIllustrationPalette.fromTokens(
    AppColorTokens colors,
    AppTone tone,
  ) {
    final accent = tone == AppTone.neutral
        ? colors.foreground.withValues(alpha: 0.72)
        : tone.foreground(colors);
    return AppIllustrationPalette(
      backdrop: tone.fill(colors),
      accent: accent,
      onAccent: colors.card,
      surface: colors.card,
      outline: colors.mutedForeground.withValues(alpha: 0.55),
      detail: colors.mutedForeground.withValues(alpha: 0.28),
    );
  }

  factory AppIllustrationPalette.of(BuildContext context, AppTone tone) =>
      AppIllustrationPalette.fromTokens(
        AppTokens.of(context).colorScheme,
        tone,
      );

  /// Soft disc behind the scene.
  final Color backdrop;

  /// Highlights, badges and the moving part of the scene.
  final Color accent;

  /// Marks drawn on top of [accent].
  final Color onAccent;

  /// Paper, cards and other object bodies.
  final Color surface;
  final Color outline;

  /// Placeholder text lines and grid marks.
  final Color detail;

  @override
  bool operator ==(Object other) =>
      other is AppIllustrationPalette &&
      other.backdrop == backdrop &&
      other.accent == accent &&
      other.onAccent == onAccent &&
      other.surface == surface &&
      other.outline == outline &&
      other.detail == detail;

  @override
  int get hashCode =>
      Object.hash(backdrop, accent, onAccent, surface, outline, detail);
}
