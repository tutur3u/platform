import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';

void main() {
  test('default appearance keeps the original shad themes', () {
    const settings = AppearanceSettings();
    expect(
      AppearanceTheme.shadTheme(settings, Brightness.light),
      same(MobileShadTheme.light),
    );
    expect(
      AppearanceTheme.shadTheme(settings, Brightness.dark),
      same(MobileShadTheme.dark),
    );
  });

  test('contrast ratio matches WCAG reference values', () {
    expect(
      AppearanceContrast.ratio(
        const Color(0xFF000000),
        const Color(0xFFFFFFFF),
      ),
      closeTo(21, 0.01),
    );
    expect(
      AppearanceContrast.ratio(
        const Color(0xFF777777),
        const Color(0xFFFFFFFF),
      ),
      closeTo(4.48, 0.01),
    );
  });

  // Text sits on the page background, an ambient blend of the gradient and
  // blob colours at any intensity, or a translucent card above that blend.
  // The per-channel bound covers every such sRGB blend, so passing it proves
  // AA for all intensities, softness values and card opacities.
  for (final palette in AppearancePalettes.all) {
    for (final brightness in Brightness.values) {
      test('${palette.id.name} ${brightness.name} text meets WCAG AA', () {
        final tones = palette.tones(brightness);
        final scheme = AppearanceTheme.colorScheme(
          AppearanceSettings(
            theme: palette.id,
            backgroundStyle: AppearanceBackgroundStyle.blobs,
          ),
          brightness,
        );
        final worst = AppearanceContrast.channelBound([
          tones.base,
          scheme.background,
          scheme.card,
          ...tones.gradient,
          ...tones.blobs,
        ], lightest: brightness == Brightness.dark);
        for (final (label, text) in [
          ('foreground', scheme.foreground),
          ('muted', scheme.mutedForeground),
        ]) {
          final ratio = AppearanceContrast.ratio(text, worst);
          expect(
            ratio,
            greaterThanOrEqualTo(AppearanceContrast.aaText),
            reason: '$label ratio ${ratio.toStringAsFixed(2)}',
          );
        }
      });

      for (final accent in AppearanceAccentId.values) {
        test('${palette.id.name} ${brightness.name} ${accent.name} accent', () {
          final tones = palette.tones(brightness);
          final scheme = AppearanceTheme.colorScheme(
            AppearanceSettings(
              theme: palette.id,
              accent: accent,
              backgroundStyle: AppearanceBackgroundStyle.gradient,
            ),
            brightness,
          );
          final label = AppearanceContrast.ratio(
            scheme.primary,
            scheme.primaryForeground,
          );
          expect(label, greaterThanOrEqualTo(AppearanceContrast.aaText));
          final worst = AppearanceContrast.channelBound([
            tones.base,
            ...tones.gradient,
            ...tones.blobs,
          ], lightest: brightness == Brightness.dark);
          final control = AppearanceContrast.ratio(scheme.primary, worst);
          expect(
            control,
            greaterThanOrEqualTo(AppearanceContrast.aaNonText),
            reason: 'accent vs background ${control.toStringAsFixed(2)}',
          );
        });
      }
    }
  }
}
