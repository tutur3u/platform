import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palette_types.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
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
    required this.ink,
    required this.hues,
  });

  /// [hues] defaults to the Sorbet hues when the theme carries them, and to
  /// tints of the classic status roles otherwise.
  factory AppIllustrationPalette.fromTokens(
    AppColorTokens colors,
    AppTone tone, {
    SorbetHues? hues,
  }) {
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
      ink: colors.foreground,
      hues: hues ?? classicHues(colors),
    );
  }

  factory AppIllustrationPalette.of(BuildContext context, AppTone tone) =>
      AppIllustrationPalette.fromTokens(
        AppTokens.of(context).colorScheme,
        tone,
        hues: SorbetTokens.maybeOf(context)?.hues,
      );

  /// Multi-hue scenes on a classic theme: each hue is a tint of the status
  /// role closest to it, so the drawing still follows the theme.
  static SorbetHues classicHues(AppColorTokens c) {
    SorbetHue tint(Color ink) => SorbetHue(
      fill: ink.withValues(alpha: c.isDark ? 0.34 : 0.26),
      calm: ink.withValues(alpha: c.isDark ? 0.18 : 0.12),
      ink: ink,
    );
    return SorbetHues(
      blue: tint(c.info),
      green: tint(c.success),
      orange: tint(c.warning),
      red: tint(c.destructive),
      yellow: tint(c.warning),
      purple: tint(c.info),
      pink: tint(c.destructive),
      teal: tint(c.success),
      gray: tint(c.mutedForeground),
    );
  }

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

  /// Strong strokes and faces (the foreground role).
  final Color ink;

  /// Pastel fills, calm backdrops and inks for multi-hue scenes.
  final SorbetHues hues;

  @override
  bool operator ==(Object other) =>
      other is AppIllustrationPalette &&
      other.backdrop == backdrop &&
      other.accent == accent &&
      other.onAccent == onAccent &&
      other.surface == surface &&
      other.outline == outline &&
      other.detail == detail &&
      other.ink == ink &&
      _sameHues(other.hues, hues);

  static List<SorbetHue> _list(SorbetHues h) => [
    h.blue,
    h.green,
    h.orange,
    h.red,
    h.yellow,
    h.purple,
    h.pink,
    h.teal,
    h.gray,
  ];

  static bool _sameHues(SorbetHues a, SorbetHues b) {
    if (identical(a, b)) return true;
    final x = _list(a);
    final y = _list(b);
    for (var i = 0; i < x.length; i++) {
      if (x[i].fill != y[i].fill ||
          x[i].calm != y[i].calm ||
          x[i].ink != y[i].ink) {
        return false;
      }
    }
    return true;
  }

  @override
  int get hashCode => Object.hash(
    backdrop,
    accent,
    onAccent,
    surface,
    outline,
    detail,
    ink,
    Object.hashAll([for (final h in _list(hues)) h.fill]),
  );
}
