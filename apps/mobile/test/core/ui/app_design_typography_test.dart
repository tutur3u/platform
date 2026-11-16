import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/ui.dart';

import '../../helpers/pump_app.dart';

void main() {
  group('classic typography', () {
    const type = AppTypography();

    test('component roles equal the legacy styles they replace', () {
      expect(type.ui, type.textSmall);
      expect(type.uiSm, type.xSmall.merge(type.medium));
      expect(type.uiCompact, type.small);
      expect(type.body, type.base);
      expect(type.bodySm, type.small);
      expect(type.caption, type.label);
    });

    test('keeps Noto Sans and no line heights', () {
      for (final style in [type.title, type.heading, type.ui, type.numeric]) {
        expect(style.fontFamily, 'NotoSans');
        expect(style.height, isNull);
      }
      expect(type.numeric.fontFeatures, [const FontFeature.tabularFigures()]);
    });

    testWidgets('AppTokens hands out the classic scale', (tester) async {
      late AppTokens tokens;
      await tester.pumpWidget(
        sorbetTestApp(
          home: Builder(
            builder: (context) {
              tokens = AppTokens.of(context);
              return const SizedBox();
            },
          ),
        ),
      );
      expect(tokens.typography, const AppTypography());
    });

    test('the classic themes keep their text themes', () {
      for (final b in Brightness.values) {
        final base = b == Brightness.dark ? AppTheme.dark : AppTheme.light;
        final shad = AppearanceTheme.shadThemeFor(
          const AppearanceSettings(),
          null,
          b,
        ).typography;
        expect(shad.sans.fontFamily, 'NotoSans');
        expect(shad.mono.fontFamily, isNot(SorbetFonts.mono));
        expect(
          AppearanceTheme.materialTheme(
            const AppearanceSettings(),
            b,
          ).textTheme,
          base.textTheme,
        );
      }
    });
  });

  group('Sorbet typography', () {
    final type = SorbetTokens.resolve(
      const SorbetTheme(),
      Brightness.light,
      ring: const Color(0xFF000000),
    ).typography;

    test('uses the contract mobile styles', () {
      void expectStyle(
        TextStyle style,
        double size,
        FontWeight weight, {
        double? lineHeight,
      }) {
        expect(style.fontSize, size);
        expect(style.fontWeight, weight);
        if (lineHeight != null) {
          expect(style.height! * size, closeTo(lineHeight, 0.001));
        }
      }

      expectStyle(type.title, 22, FontWeight.w700, lineHeight: 28);
      expectStyle(type.heading, 18, FontWeight.w700, lineHeight: 24);
      expectStyle(type.body, 16, FontWeight.w400, lineHeight: 16 * 1.55);
      expectStyle(type.ui, 15, FontWeight.w600, lineHeight: 20);
      expectStyle(type.bodySm, 13.5, FontWeight.w400, lineHeight: 20);
      expectStyle(type.caption, 12.5, FontWeight.w600, lineHeight: 16);
      expectStyle(type.overline, 11, FontWeight.w400, lineHeight: 16);
      expectStyle(type.numeric, 11.5, FontWeight.w400, lineHeight: 16);
      expect(type.title.letterSpacing, closeTo(-0.22, 0.0001));
      expect(type.overline.letterSpacing, closeTo(1.32, 0.0001));
    });

    test('label and numeric are mono; the rest is sans', () {
      expect(type.overline.fontFamily, 'JetBrainsMono');
      expect(type.numeric.fontFamily, 'JetBrainsMono');
      expect(type.numeric.fontFeatures, [const FontFeature.tabularFigures()]);
      expect(type.title.fontFamily, 'Nunito');
      expect(type.base.fontFamily, 'Nunito');
      expect(type.base.fontSize, 16);
    });

    for (final (font, family) in [
      (SorbetFont.nunito, 'Nunito'),
      (SorbetFont.noto, 'NotoSans'),
      (SorbetFont.system, null),
    ]) {
      test('the ${font.name} setting drives every sans family', () {
        final sorbet = SorbetTheme(font: font);
        for (final b in Brightness.values) {
          final material = SorbetAppTheme.materialTheme(sorbet, b);
          final tokens = material.extension<SorbetTokens>()!;
          expect(tokens.typography.fontFamily, family);
          expect(tokens.typography.monoFamily, 'JetBrainsMono');
          final shad = AppearanceTheme.shadThemeFor(
            const AppearanceSettings(),
            sorbet,
            b,
          ).typography;
          expect(shad.sans.fontFamily, family);
          expect(shad.mono.fontFamily, 'JetBrainsMono');
          if (family != null) {
            expect(material.textTheme.bodyMedium?.fontFamily, family);
            expect(material.textTheme.displayLarge?.fontFamily, family);
          }
        }
      });
    }

    test('the Material text theme maps the contract roles', () {
      final text = SorbetAppTheme.materialTheme(
        const SorbetTheme(),
        Brightness.light,
      ).textTheme;
      for (final (style, role) in [
        (text.titleLarge, type.title),
        (text.titleMedium, type.heading),
        (text.bodyLarge, type.bodyLg),
        (text.bodyMedium, type.body),
        (text.bodySmall, type.bodySm),
        (text.labelLarge, type.ui),
        (text.labelMedium, type.uiSm),
        (text.labelSmall, type.caption),
      ]) {
        expect(style?.fontSize, role.fontSize);
        expect(style?.fontWeight, role.fontWeight);
        expect(style?.height, role.height);
        expect(style?.fontFamily, 'Nunito');
        expect(style?.color, isNotNull);
      }
    });

    testWidgets('AppTokens hands out the Sorbet scale', (tester) async {
      late AppTokens tokens;
      await tester.pumpWidget(
        sorbetTestApp(
          sorbet: const SorbetTheme(font: SorbetFont.noto),
          home: Builder(
            builder: (context) {
              tokens = AppTokens.of(context);
              return const SizedBox();
            },
          ),
        ),
      );
      expect(tokens.typography.fontFamily, 'NotoSans');
      expect(tokens.typography.scale, same(AppTypeScale.sorbet));
    });
  });
}
