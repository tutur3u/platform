import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_theme.dart';

void main() {
  void check(String what, Color a, Color b, double target) {
    final ratio = AppearanceContrast.ratio(a, b);
    expect(
      ratio,
      greaterThanOrEqualTo(target),
      reason: '$what is ${ratio.toStringAsFixed(2)}:1, needs $target:1',
    );
  }

  for (final preset in SorbetPreset.values) {
    for (final b in Brightness.values) {
      test('${preset.id} ${b.name} text meets its contrast target', () {
        final theme = SorbetTheme(preset: preset);
        final scheme = SorbetAppTheme.colorTokens(theme, b);
        final text = preset == SorbetPreset.highContrast ? 7.0 : 4.5;
        for (final (name, fill) in [
          ('background', scheme.background),
          ('card', scheme.card),
        ]) {
          check('foreground on $name', scheme.foreground, fill, text);
          check('card foreground on $name', scheme.cardForeground, fill, text);
          check(
            'muted foreground on $name',
            scheme.mutedForeground,
            fill,
            text,
          );
        }
        check(
          'primary foreground on primary',
          scheme.primaryForeground,
          scheme.primary,
          AppearanceContrast.aaText,
        );
        final tokens = SorbetAppTheme.colorTokens(theme, b);
        for (final (name, ink) in [
          ('success', tokens.success),
          ('warning', tokens.warning),
          ('info', tokens.info),
          ('destructive', tokens.destructive),
        ]) {
          check('$name on background', ink, scheme.background, 4.5);
        }
      });
    }
  }

  for (final accent in ['#ffeb3b', '#00ff00', '#1a1a1a', '#ff8fd0']) {
    test('custom accent $accent stays readable', () {
      for (final b in Brightness.values) {
        final theme = SorbetTheme(preset: SorbetPreset.lagoon, accent: accent);
        final scheme = SorbetAppTheme.colorTokens(theme, b);
        expect(scheme.ring, scheme.primary);
        check(
          '$accent ${b.name} primary on background',
          scheme.primary,
          scheme.background,
          AppearanceContrast.aaText,
        );
        check(
          '$accent ${b.name} label on primary',
          scheme.primaryForeground,
          scheme.primary,
          AppearanceContrast.aaText,
        );
      }
    });
  }
}
