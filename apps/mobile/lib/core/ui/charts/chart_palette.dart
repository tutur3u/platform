import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

@immutable
class AppChartPalette {
  AppChartPalette.fromTokens(AppColorTokens tokens)
    : surface = tokens.card,
      grid = tokens.border.withValues(alpha: 0.5),
      text = _guard(tokens.cardForeground, tokens, 4.5),
      mutedText = _guard(tokens.mutedForeground, tokens, 4.5),
      neutral = _guard(tokens.foreground, tokens, 3),
      destructive = _guard(tokens.destructive, tokens, 3),
      slots = List.unmodifiable(
        (tokens.isDark ? darkSteps : lightSteps).map(
          (color) => _guard(color, tokens, 3),
        ),
      ),
      _tokens = tokens;

  factory AppChartPalette.of(BuildContext context) =>
      AppChartPalette.fromTokens(AppTokens.of(context).colorScheme);

  static const lightSteps = [
    Color(0xFF0072B2),
    Color(0xFFA66F00),
    Color(0xFF008A65),
    Color(0xFFC25500),
    Color(0xFFB85C93),
    Color(0xFF2E86BF),
  ];
  static const darkSteps = [
    Color(0xFF0072B2),
    Color(0xFFE69F00),
    Color(0xFF009E73),
    Color(0xFFD55E00),
    Color(0xFFCC79A7),
    Color(0xFF56B4E9),
  ];

  static Color _guard(Color color, AppColorTokens tokens, double target) {
    // The channel bound covers both the opaque card and its page blend.
    final against = AppearanceContrast.channelBound([
      tokens.card,
      tokens.background,
    ], lightest: tokens.isDark);
    return AppearanceContrast.ensureContrast(
      color,
      against: against,
      target: target,
    );
  }

  final AppColorTokens _tokens;
  final List<Color> slots;
  final Color surface;
  final Color grid;
  final Color text;
  final Color mutedText;
  final Color neutral;
  final Color destructive;

  Color tone(AppTone tone) => _guard(tone.foreground(_tokens), _tokens, 4.5);
}
