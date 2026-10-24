import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_contrast.dart';
import 'package:mobile/core/theme/appearance/appearance_palettes.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Every background text or a role colour can be drawn on: the theme's base,
/// gradient and blob colours at any intensity, cards (solid or translucent),
/// the Settings group fill and subtle surfaces. The per-channel bound covers
/// every sRGB blend of them.
Color _worst(
  AppearanceSettings settings,
  Brightness b,
  shad.ColorScheme scheme,
) {
  final tones = AppearancePalettes.of(settings.theme).tones(b);
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
  ], lightest: b == Brightness.dark);
}

void _expectRoles(AppearanceSettings settings, Brightness b) {
  final scheme = AppearanceTheme.colorScheme(settings, b);
  final worst = _worst(settings, b, scheme);
  void check(String role, Color a, Color c, double target) {
    final ratio = AppearanceContrast.ratio(a, c);
    expect(
      ratio,
      greaterThanOrEqualTo(target),
      reason: '$role ${ratio.toStringAsFixed(2)} < $target',
    );
  }

  const aa = AppearanceContrast.aaText;
  // Text and text-like role colours on every page and card background.
  check('foreground', scheme.foreground, worst, aa);
  check('muted text', scheme.mutedForeground, worst, aa);
  check('card text', scheme.cardForeground, scheme.card, aa);
  check('popover text', scheme.popoverForeground, scheme.popover, aa);
  check('primary', scheme.primary, worst, AppearanceContrast.aaNonText);
  check('destructive', scheme.destructive, worst, aa);
  // Labels on filled role colours.
  check('on primary', scheme.primaryForeground, scheme.primary, aa);
  final material = AppearanceTheme.materialTheme(settings, b).colorScheme;
  check('on error', material.onError, material.error, aa);
  // The app-wide destructive button: solid fill and label, plus the
  // hover/press fill (see accessible_destructive_button.dart).
  final destructiveLabel = AppearanceTheme.labelOn(scheme.destructive);
  check('destructive button', destructiveLabel, scheme.destructive, aa);
  check(
    'destructive button pressed',
    destructiveLabel,
    Color.lerp(scheme.destructive, destructiveLabel, 0.08)!,
    aa,
  );
  check('on primary (Material)', material.onPrimary, material.primary, aa);
  check('on secondary', scheme.secondaryForeground, scheme.secondary, aa);
  check('on accent', scheme.accentForeground, scheme.accent, aa);
  check('muted on muted', scheme.mutedForeground, scheme.muted, aa);
}

void main() {
  test('Classic dark solid keeps the original shad theme', () {
    const settings = AppearanceSettings();
    expect(
      AppearanceTheme.shadTheme(settings, Brightness.dark),
      same(MobileShadTheme.dark),
    );
  });

  test('Classic light is an iOS-style grouped page with white cards', () {
    final scheme = AppearanceTheme.colorScheme(
      const AppearanceSettings(),
      Brightness.light,
    );
    expect(scheme.background, const Color(0xFFF2F2F7));
    expect(scheme.card, const Color(0xFFFFFFFF));
    expect(SettingsRowLayout.solidGroupFill(scheme), scheme.card);
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

  for (final b in Brightness.values) {
    test('default appearance ${b.name} roles meet WCAG AA', () {
      _expectRoles(const AppearanceSettings(), b);
    });
  }

  for (final palette in AppearancePalettes.all) {
    for (final b in Brightness.values) {
      for (final style in AppearanceBackgroundStyle.values) {
        test('${palette.id.name} ${b.name} ${style.name} roles meet AA', () {
          _expectRoles(
            AppearanceSettings(theme: palette.id, backgroundStyle: style),
            b,
          );
        });
      }
      for (final accent in AppearanceAccentId.values) {
        test('${palette.id.name} ${b.name} ${accent.name} accent', () {
          final settings = AppearanceSettings(
            theme: palette.id,
            accent: accent,
            backgroundStyle: AppearanceBackgroundStyle.blobs,
          );
          _expectRoles(settings, b);
          // Accents rendered as text (links, captions) also reach AA.
          final scheme = AppearanceTheme.colorScheme(settings, b);
          final ratio = AppearanceContrast.ratio(
            scheme.primary,
            _worst(settings, b, scheme),
          );
          expect(ratio, greaterThanOrEqualTo(AppearanceContrast.aaText));
        });
      }
    }
  }
}
