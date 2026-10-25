import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';

/// Per appearance (theme, background style and accent), the per-channel
/// bound of every surface of [brightness] an identity tile, selection mark or
/// tinted row can sit on, closest to the accent fills: darkest in light mode,
/// lightest in dark mode. Bounds are per appearance, as in
/// `appearance_contrast_test.dart`, because only one theme paints at a time.
Map<String, Color> _worstSurfaces(Brightness brightness) => {
  for (final palette in AppearancePalettes.all)
    for (final style in AppearanceBackgroundStyle.values)
      for (final accent in AppearanceAccentId.values)
        '${palette.id.name}/${style.name}/${accent.name}': () {
          final settings = AppearanceSettings(
            theme: palette.id,
            backgroundStyle: style,
            accent: accent,
          );
          final scheme = AppearanceTheme.colorScheme(settings, brightness);
          final tones = palette.tones(brightness);
          return AppearanceContrast.channelBound([
            scheme.background,
            scheme.card,
            scheme.muted,
            SettingsRowLayout.solidGroupFill(scheme),
            if (settings.hasAmbientBackground) ...[
              tones.base,
              ...tones.gradient,
              ...tones.blobs,
            ],
          ], lightest: brightness == Brightness.dark);
        }(),
};

void main() {
  test('core brand accents are the published logo marks', () {
    expect(AppearancePalettes.brandAccents, BrandAccents.core);
    expect(BrandAccents.core.map((accent) => accent.mark).toList(), const [
      Color(0xFF4180E9),
      Color(0xFF4ACA3F),
      Color(0xFFFB7B05),
      Color(0xFFE94646),
    ]);
    expect(BrandAccents.ink, const Color(0xFF09090B));
    expect(BrandAccents.identity, hasLength(8));
  });

  for (final brightness in Brightness.values) {
    final worst = _worstSurfaces(brightness);
    final foreground = AppearanceTheme.colorScheme(
      const AppearanceSettings(),
      brightness,
    ).foreground;

    for (final accent in AppearancePalettes.identityAccents) {
      group('${accent.name} ${brightness.name}', () {
        final fill = accent.fill(brightness);

        test('initials and check reach AA on the fill', () {
          final ratio = AppearanceContrast.ratio(
            accent.onFill(brightness),
            fill,
          );
          expect(
            ratio,
            greaterThanOrEqualTo(AppearanceContrast.aaText),
            reason: 'label ${ratio.toStringAsFixed(2)}',
          );
        });

        test('selection fill reaches 3:1 on every surface', () {
          for (final MapEntry(:key, :value) in worst.entries) {
            final ratio = AppearanceContrast.ratio(fill, value);
            expect(
              ratio,
              greaterThanOrEqualTo(AppearanceContrast.aaNonText),
              reason: '$key fill ${ratio.toStringAsFixed(2)}',
            );
          }
        });

        test('foreground text stays AA on the selection tint', () {
          for (final surface in [...worst.values, ..._themeCards(brightness)]) {
            final washed = AppearanceContrast.over(
              accent.tint(brightness),
              surface,
            );
            final ratio = AppearanceContrast.ratio(foreground, washed);
            expect(
              ratio,
              greaterThanOrEqualTo(AppearanceContrast.aaText),
              reason: 'text on tint ${ratio.toStringAsFixed(2)}',
            );
          }
        });
      });
    }
  }

  test('identity colours are stable and portable per key', () {
    // FNV-1a indices; changing the hash or palette order recolours every
    // workspace, so these are pinned.
    expect(BrandAccents.indexForKey('personal_ws'), 0);
    expect(BrandAccents.indexForKey('ws_3'), 1);
    expect(BrandAccents.indexForKey('ws_1'), 3);
    expect(BrandAccents.indexForKey('ws_2'), 6);
    expect(BrandAccents.forKey('ws_1'), same(BrandAccents.impact));
    expect({
      for (var i = 0; i < 40; i++) BrandAccents.indexForKey('team-$i'),
    }, hasLength(BrandAccents.identity.length));
  });
}

List<Color> _themeCards(Brightness brightness) => [
  for (final palette in AppearancePalettes.all)
    AppearanceTheme.colorScheme(
      AppearanceSettings(theme: palette.id),
      brightness,
    ).card,
];
