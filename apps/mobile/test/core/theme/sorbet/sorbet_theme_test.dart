import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/appearance/interface_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_palettes.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_scope.dart';
import 'package:mobile/core/theme/sorbet/sorbet_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/tokens/app_color_tokens.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';

import '../../../helpers/pump_app.dart';

const _appearances = [
  AppearanceSettings(),
  AppearanceSettings(
    theme: AppearanceThemeId.aurora,
    backgroundStyle: AppearanceBackgroundStyle.blobs,
  ),
  AppearanceSettings(
    accent: AppearanceAccentId.rose,
    density: AppDensity.compact,
    corners: AppCornerStyle.square,
  ),
];

/// Pumps the app's theme pipeline and returns the bridge's Material theme.
Future<ThemeData> _pumpTheme(
  WidgetTester tester,
  AppearanceSettings appearance,
  SorbetTheme? sorbet, {
  Brightness brightness = Brightness.light,
  void Function(BuildContext context)? inspect,
}) async {
  late ThemeData theme;
  await tester.pumpWidget(
    sorbetTestApp(
      appearance: appearance,
      sorbet: sorbet,
      brightness: brightness,
      home: Builder(
        builder: (context) {
          // Theme.of subscribes to changes but returns a localized copy, so
          // the identity check reads the bridge's own data.
          Theme.of(context);
          theme = context.findAncestorWidgetOfExactType<Theme>()!.data;
          inspect?.call(context);
          return const SizedBox.shrink();
        },
      ),
    ),
  );
  // Theme mode changes land on the next frame.
  await tester.pumpAndSettle();
  return theme;
}

void main() {
  group('classic identity', () {
    test('selection returns the classic objects without Sorbet', () {
      for (final appearance in _appearances) {
        for (final b in Brightness.values) {
          expect(
            identical(
              AppearanceTheme.shadThemeFor(appearance, null, b),
              AppearanceTheme.shadTheme(appearance, b),
            ),
            isTrue,
          );
        }
        expect(
          identical(AppThemeSelection.backdrop(appearance, null), appearance),
          isTrue,
        );
      }
    });

    testWidgets('the bridge keeps the classic Material theme', (tester) async {
      for (final appearance in _appearances) {
        for (final b in Brightness.values) {
          final theme = await _pumpTheme(
            tester,
            appearance,
            null,
            brightness: b,
          );
          final expected = AppInterfaceTheme.apply(
            AppearanceTheme.materialTheme(appearance, b),
            appearance.interfaceTokens,
          );
          expect(identical(theme, expected), isTrue);
          expect(theme.extension<SorbetTokens>(), isNull);
        }
      }
    });
  });

  group('Sorbet application', () {
    testWidgets('applies the Sorbet theme, tokens and a solid page', (
      tester,
    ) async {
      const sorbet = SorbetTheme(
        preset: SorbetPreset.matcha,
        density: SorbetDensity.compact,
        radius: SorbetRadius.sharp,
      );
      late bool ambient;
      late SorbetTheme? scoped;
      final theme = await _pumpTheme(
        tester,
        _appearances[1],
        sorbet,
        inspect: (context) {
          ambient = AppearanceScope.hasAmbientBackground(context);
          scoped = SorbetScope.maybeOf(context);
        },
      );
      final roles = SorbetPalettes.roles(SorbetPreset.matcha, Brightness.light);
      expect(ambient, isFalse);
      expect(scoped, sorbet);
      expect(theme.scaffoldBackgroundColor, roles.background);
      expect(theme.colorScheme.surface, roles.background);
      expect(theme.colorScheme.surfaceContainerLowest, roles.surface);
      expect(theme.colorScheme.surfaceContainerLow, roles.surfaceSunken);
      expect(theme.colorScheme.outline, roles.border);
      expect(theme.colorScheme.outlineVariant, roles.borderStrong);
      expect(theme.colorScheme.error, roles.destructive);
      expect(theme.colorScheme.onError, roles.destructiveForeground);
      final tokens = theme.extension<SorbetTokens>()!;
      expect(tokens.radii.control, 6);
      expect(tokens.controls.md, 32);
      expect(tokens.scrim, roles.scrim);
      final colors = theme.extension<AppColorTokens>()!;
      expect(colors.primary, roles.primary);
      expect(colors.muted, roles.surfaceSunken);
      expect(colors.input, roles.borderStrong);
      final interface = theme.extension<AppInterfaceTokens>()!;
      expect(interface.density, AppDensity.compact);
      expect(interface.corners, AppCornerStyle.soft);
      expect(interface.style, _appearances[1].interfaceStyle);
    });
  });

  test('themes are cached per theme and brightness', () {
    const sorbet = SorbetTheme(preset: SorbetPreset.rose);
    for (final b in Brightness.values) {
      expect(
        identical(
          SorbetAppTheme.materialTheme(sorbet, b),
          SorbetAppTheme.materialTheme(sorbet, b),
        ),
        isTrue,
      );
      expect(
        identical(
          AppearanceTheme.shadThemeFor(const AppearanceSettings(), sorbet, b),
          AppearanceTheme.shadThemeFor(const AppearanceSettings(), sorbet, b),
        ),
        isTrue,
      );
    }
  });

  test('the Sorbet shad scheme carries the resolved roles', () {
    const sorbet = SorbetTheme(
      preset: SorbetPreset.midnight,
      accent: '#ff8800',
    );
    for (final b in Brightness.values) {
      final roles = SorbetAppTheme.colorTokens(sorbet, b);
      final scheme = AppearanceTheme.shadThemeFor(
        const AppearanceSettings(),
        sorbet,
        b,
      ).colorScheme;
      expect(scheme.background, roles.background);
      expect(scheme.card, roles.card);
      expect(scheme.primary, roles.primary);
      expect(scheme.primaryForeground, roles.primaryForeground);
      expect(scheme.muted, roles.muted);
      expect(scheme.input, roles.input);
      expect(scheme.ring, roles.ring);
      expect(scheme.destructive, roles.destructive);
    }
  });

  test('radius options scale the shad radius', () {
    for (final (option, control) in [
      (SorbetRadius.soft, 12.0),
      (SorbetRadius.sharp, 6.0),
      (SorbetRadius.round, 16.0),
    ]) {
      final theme = AppearanceTheme.shadThemeFor(
        const AppearanceSettings(),
        SorbetTheme(radius: option),
        Brightness.light,
      );
      expect(theme.radiusMd, closeTo(control, 0.001));
    }
  });

  test('a custom accent replaces primary and ring', () {
    const theme = SorbetTheme(preset: SorbetPreset.graphite, accent: '#2f55c4');
    final scheme = SorbetAppTheme.colorTokens(theme, Brightness.light);
    expect(scheme.primary, const Color(0xFF2F55C4));
    expect(scheme.ring, const Color(0xFF2F55C4));
    final tokens = SorbetAppTheme.materialTheme(
      theme,
      Brightness.light,
    ).extension<SorbetTokens>()!;
    expect(tokens.ring, scheme.ring);
  });

  test('the system font drops the bundled family', () {
    final noto = SorbetAppTheme.materialTheme(
      const SorbetTheme(font: SorbetFont.noto),
      Brightness.light,
    );
    final system = SorbetAppTheme.materialTheme(
      const SorbetTheme(font: SorbetFont.system),
      Brightness.light,
    );
    expect(noto.textTheme.bodyMedium?.fontFamily, 'NotoSans');
    expect(
      noto.textTheme.bodyMedium?.fontSize,
      system.textTheme.bodyMedium?.fontSize,
    );
    expect(system.textTheme.bodyMedium?.fontFamily, isNot('NotoSans'));
  });

  test('tokens interpolate colours and radii', () {
    final a = SorbetTokens.resolve(
      const SorbetTheme(),
      Brightness.light,
      ring: const Color(0xFF000000),
    );
    final b = SorbetTokens.resolve(
      const SorbetTheme(radius: SorbetRadius.round),
      Brightness.dark,
      ring: const Color(0xFFFFFFFF),
    );
    final mid = a.lerp(b, 0.5);
    expect(mid.radii.control, 14);
    expect(mid.ring, Color.lerp(a.ring, b.ring, 0.5));
    expect(identical(a.lerp(null, 0.5), a), isTrue);
    expect(a.copyWith(ring: const Color(0xFF123456)).ring, isNot(a.ring));
  });
}
