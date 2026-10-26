import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';

void main() {
  test('every preset survives the versioned JSON round trip', () {
    for (final theme in AppearanceThemeId.values) {
      final value = AssistantThemePreferences.preset(
        theme,
      ).copyWith(textAccent: AppearanceAccentId.violet, intensity: 0.8);
      expect(AssistantThemePreferences.decode(value.encode()), value);
    }
  });

  test('missing, malformed and unsupported versions use defaults', () {
    for (final raw in [
      null,
      '',
      '{',
      '[]',
      'null',
      'true',
      '{"messageTheme":"ocean"}',
      '{"version":2,"messageTheme":"ocean"}',
      '{"version":"1","messageTheme":"ocean"}',
      '{"version":1.0,"messageTheme":"ocean"}',
      List.filled(4097, 'x').join(),
    ]) {
      expect(
        AssistantThemePreferences.decode(raw),
        const AssistantThemePreferences(),
        reason: raw,
      );
    }
  });

  test(
    'invalid fields fall back independently and numeric values are bounded',
    () {
      final value = AssistantThemePreferences.decode(
        '{"version":1,"messageTheme":"unknown","textAccent":12,'
        '"backgroundTheme":"ocean","backgroundStyle":[],"intensity":9}',
      );
      expect(value.messageTheme, AppearanceThemeId.classic);
      expect(value.textAccent, AppearanceAccentId.neutral);
      expect(value.backgroundTheme, AppearanceThemeId.ocean);
      expect(value.backgroundStyle, AssistantBackgroundStyle.solid);
      expect(value.intensity, 1);
      expect(
        AssistantThemePreferences.decode(
          '{"version":1,"intensity":-4}',
        ).intensity,
        0,
      );
      for (final invalid in ['null', '"high"', '[]', '1e999']) {
        expect(
          AssistantThemePreferences.decode(
            '{"version":1,"intensity":$invalid}',
          ).intensity,
          AssistantThemePreferences.defaultIntensity,
        );
      }
    },
  );

  test(
    'presets choose solid, gradient and ombre without coupling custom fields',
    () {
      expect(
        AssistantThemePreferences.preset(
          AppearanceThemeId.classic,
        ).backgroundStyle,
        AssistantBackgroundStyle.solid,
      );
      expect(
        AssistantThemePreferences.preset(
          AppearanceThemeId.ocean,
        ).backgroundStyle,
        AssistantBackgroundStyle.gradient,
      );
      final aurora = AssistantThemePreferences.preset(AppearanceThemeId.aurora);
      expect(aurora.backgroundStyle, AssistantBackgroundStyle.ombre);
      final custom = aurora.copyWith(messageTheme: AppearanceThemeId.ember);
      expect(custom.backgroundTheme, aurora.backgroundTheme);
      expect(custom.textAccent, aurora.textAccent);
      expect(custom.backgroundStyle, aurora.backgroundStyle);
      expect(custom.copyWith(intensity: double.nan), custom);
    },
  );
}
