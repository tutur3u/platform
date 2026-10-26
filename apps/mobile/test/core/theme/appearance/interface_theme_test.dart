import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/appearance/interface_theme.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

void main() {
  group('AppearanceSettings interface fields', () {
    test('round-trip through the stored payload', () {
      const settings = AppearanceSettings(
        interfaceStyle: AppInterfaceStyle.material,
        density: AppDensity.compact,
        corners: AppCornerStyle.soft,
        reduceMotion: true,
      );
      expect(AppearanceSettings.decode(settings.encode()), settings);
    });

    test('older payloads and unknown values fall back field by field', () {
      final legacy = jsonEncode({'version': 1, 'theme': 'aurora'});
      final decoded = AppearanceSettings.decode(legacy);
      expect(decoded.theme, AppearanceThemeId.aurora);
      expect(decoded.interfaceTokens, AppInterfaceTokens.standard);
      expect(decoded.reduceMotion, isFalse);

      final unknown = jsonEncode({
        'interface': 'windows-phone',
        'density': 'cosy',
        'corners': 7,
        'reduceMotion': 'yes',
      });
      expect(AppearanceSettings.decode(unknown), const AppearanceSettings());
    });

    test('interface choices reuse the cached colour themes', () {
      const styled = AppearanceSettings(corners: AppCornerStyle.square);
      expect(styled.isDefault, isFalse);
      expect(
        identical(
          AppearanceTheme.materialTheme(styled, Brightness.light),
          AppearanceTheme.materialTheme(
            const AppearanceSettings(),
            Brightness.light,
          ),
        ),
        isTrue,
      );
    });
  });

  group('AppInterfaceTokens', () {
    test('corner styles scale radii but keep pills round', () {
      const rounded = AppInterfaceTokens.standard;
      const soft = AppInterfaceTokens(corners: AppCornerStyle.soft);
      const square = AppInterfaceTokens(corners: AppCornerStyle.square);
      expect(rounded.radius(AppRadius.card), AppRadius.card);
      expect(soft.radius(AppRadius.card), 13);
      expect(square.radius(AppRadius.card), 4);
      expect(square.radius(2), 2);
      expect(square.radius(AppRadius.pill), AppRadius.pill);
    });

    test('density never drops a row below the touch target', () {
      for (final density in AppDensity.values) {
        expect(
          AppInterfaceTokens(density: density).rowMinHeight,
          greaterThanOrEqualTo(AppInterfaceTokens.minTouchTarget),
        );
      }
      expect(
        const AppInterfaceTokens(density: AppDensity.compact).rowMinHeight,
        lessThan(AppInterfaceTokens.standard.rowMinHeight),
      );
    });

    test('styles choose scroll physics; Tuturuuu keeps the platform', () {
      expect(AppInterfaceTokens.standard.scrollPhysics, isNull);
      expect(
        const AppInterfaceTokens(style: AppInterfaceStyle.ios).scrollPhysics,
        isA<BouncingScrollPhysics>(),
      );
      expect(
        const AppInterfaceTokens(
          style: AppInterfaceStyle.material,
        ).scrollPhysics,
        isA<ClampingScrollPhysics>(),
      );
    });
  });

  group('AppInterfaceTheme', () {
    test('the default style keeps the exact base theme', () {
      expect(
        identical(
          AppInterfaceTheme.apply(AppTheme.light, AppInterfaceTokens.standard),
          AppTheme.light,
        ),
        isTrue,
      );
    });

    test('a chosen style installs its transitions and extension once', () {
      const tokens = AppInterfaceTokens(
        style: AppInterfaceStyle.ios,
        corners: AppCornerStyle.square,
      );
      final themed = AppInterfaceTheme.apply(AppTheme.dark, tokens);
      expect(
        themed.pageTransitionsTheme,
        AppTheme.pageTransitionsFor(AppInterfaceStyle.ios),
      );
      expect(themed.extension<AppInterfaceTokens>(), tokens);
      expect(
        identical(AppInterfaceTheme.apply(AppTheme.dark, tokens), themed),
        isTrue,
      );
    });

    test('Material-like keeps the system edge-swipe transition on iOS', () {
      final ios = AppTheme.pageTransitionsFor(AppInterfaceStyle.ios).builders;
      final material = AppTheme.pageTransitionsFor(
        AppInterfaceStyle.material,
      ).builders;
      expect(
        identical(material[TargetPlatform.iOS], ios[TargetPlatform.iOS]),
        isTrue,
      );
      expect(
        identical(
          material[TargetPlatform.android],
          ios[TargetPlatform.android],
        ),
        isFalse,
      );
    });
  });

  group('AppInterfaceScope', () {
    Future<BuildContext> pumpScope(
      WidgetTester tester,
      AppearanceSettings settings, {
      bool systemReduce = false,
    }) async {
      late BuildContext inner;
      await tester.pumpWidget(
        MediaQuery(
          data: MediaQueryData(disableAnimations: systemReduce),
          child: Theme(
            data: AppInterfaceTheme.apply(
              AppTheme.light,
              settings.interfaceTokens,
            ),
            child: AppInterfaceScope(
              settings: settings,
              child: Builder(
                builder: (context) {
                  inner = context;
                  return const SizedBox.shrink();
                },
              ),
            ),
          ),
        ),
      );
      return inner;
    }

    testWidgets('Reduce motion adds to the system setting, never removes it', (
      tester,
    ) async {
      var context = await pumpScope(
        tester,
        const AppearanceSettings(reduceMotion: true),
      );
      expect(MediaQuery.disableAnimationsOf(context), isTrue);

      context = await pumpScope(
        tester,
        const AppearanceSettings(),
        systemReduce: true,
      );
      expect(MediaQuery.disableAnimationsOf(context), isTrue);

      context = await pumpScope(tester, const AppearanceSettings());
      expect(MediaQuery.disableAnimationsOf(context), isFalse);
    });

    testWidgets('tokens reach components through AppTokens', (tester) async {
      final context = await pumpScope(
        tester,
        const AppearanceSettings(
          interfaceStyle: AppInterfaceStyle.material,
          corners: AppCornerStyle.soft,
        ),
      );
      final tokens = AppTokens.of(context);
      expect(tokens.interface.style, AppInterfaceStyle.material);
      expect(tokens.radiusXl, 10);
      expect(
        ScrollConfiguration.of(context).getScrollPhysics(context),
        isA<ClampingScrollPhysics>(),
      );
    });
  });
}
