import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_colors.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';

void main() {
  test(
    'all palettes, text accents and background styles retain AA contrast',
    () {
      for (final brightness in Brightness.values) {
        for (final theme in AppearanceThemeId.values) {
          for (final accent in AppearanceAccentId.values) {
            for (final style in AssistantBackgroundStyle.values) {
              for (final intensity in [0.0, 1.0]) {
                final value = AssistantThemePreferences(
                  messageTheme: theme,
                  textAccent: accent,
                  backgroundTheme: AppearanceThemeId.values.reversed.elementAt(
                    theme.index,
                  ),
                  backgroundStyle: style,
                  intensity: intensity,
                );
                final colors = AssistantThemeColors.resolve(value, brightness);
                final reason = '$brightness/$theme/$accent/$style/$intensity';
                void contrast(Color text, Color background) => expect(
                  AppearanceContrast.ratio(text, background),
                  greaterThanOrEqualTo(AppearanceContrast.aaText),
                  reason: reason,
                );
                for (final message in [
                  colors.userMessage,
                  colors.assistantMessage,
                ]) {
                  contrast(message.foreground, message.background);
                  contrast(message.mutedForeground, message.background);
                }
                for (final stop in colors.backgroundColors) {
                  contrast(colors.foreground, stop);
                  contrast(colors.mutedForeground, stop);
                }
                for (var i = 1; i < colors.backgroundColors.length; i++) {
                  for (var step = 1; step < 10; step++) {
                    final blend = Color.lerp(
                      colors.backgroundColors[i - 1],
                      colors.backgroundColors[i],
                      step / 10,
                    )!;
                    contrast(colors.foreground, blend);
                    contrast(colors.mutedForeground, blend);
                  }
                }
              }
            }
          }
        }
      }
    },
  );

  test(
    'brightness changes resolution without changing persisted preferences',
    () {
      final value = AssistantThemePreferences.preset(AppearanceThemeId.ocean);
      final light = AssistantThemeColors.resolve(value, Brightness.light);
      final dark = AssistantThemeColors.resolve(value, Brightness.dark);
      expect(light.backgroundColors, isNot(dark.backgroundColors));
      expect(light.userMessage.foreground, isNot(dark.userMessage.foreground));
      expect(AssistantThemePreferences.decode(value.encode()), value);
    },
  );

  test('solid, gradient and ombre produce their distinct static backdrops', () {
    for (final style in AssistantBackgroundStyle.values) {
      final colors = AssistantThemeColors.resolve(
        AssistantThemePreferences(backgroundStyle: style),
        Brightness.light,
      );
      expect(colors.backgroundColors.length, switch (style) {
        AssistantBackgroundStyle.solid => 1,
        AssistantBackgroundStyle.gradient => 2,
        AssistantBackgroundStyle.ombre => 3,
      });
      if (style == AssistantBackgroundStyle.solid) {
        expect(colors.backgroundDecoration.gradient, isNull);
      } else {
        final gradient =
            colors.backgroundDecoration.gradient! as LinearGradient;
        expect(
          gradient.begin,
          style == AssistantBackgroundStyle.ombre
              ? Alignment.topCenter
              : Alignment.topLeft,
        );
      }
    }
  });
}
