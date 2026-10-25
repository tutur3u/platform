import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_colors.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_scope.dart';

void main() {
  testWidgets(
    'one scope reuses colors until preferences or brightness change',
    (tester) async {
      final samples = <AssistantThemeColors>[];
      AppColorTokens? pageTokens;
      final value = AssistantThemePreferences.preset(AppearanceThemeId.aurora);

      Widget app(
        AssistantThemePreferences preferences, {
        Brightness brightness = Brightness.light,
      }) => MaterialApp(
        theme: ThemeData(brightness: brightness),
        themeAnimationDuration: Duration.zero,
        home: AssistantThemeScope(
          value: preferences,
          child: Column(
            children: [
              Builder(
                builder: (context) {
                  samples.add(AssistantThemeScope.of(context));
                  pageTokens = AppTokens.of(context).colorScheme;
                  return const SizedBox();
                },
              ),
              Builder(
                builder: (context) {
                  samples.add(AssistantThemeScope.of(context));
                  return const SizedBox();
                },
              ),
            ],
          ),
        ),
      );

      await tester.pumpWidget(app(value));
      final first = samples.first;
      expect(samples.length, 2);
      expect(identical(samples.last, first), isTrue);
      expect(pageTokens!.foreground, first.foreground);
      expect(pageTokens!.mutedForeground, first.mutedForeground);
      expect(pageTokens!.primaryForeground, first.backgroundColors.first);

      samples.clear();
      await tester.pumpWidget(app(value.copyWith()));
      expect(samples, isNotEmpty);
      expect(samples.every((colors) => identical(colors, first)), isTrue);

      samples.clear();
      await tester.pumpWidget(app(value, brightness: Brightness.dark));
      final dark = samples.first;
      expect(identical(dark, first), isFalse);
      expect(samples.every((colors) => identical(colors, dark)), isTrue);
      expect(pageTokens!.brightness, Brightness.dark);
      expect(pageTokens!.foreground, dark.foreground);

      samples.clear();
      final changed = value.copyWith(messageTheme: AppearanceThemeId.ocean);
      await tester.pumpWidget(app(changed, brightness: Brightness.dark));
      expect(identical(samples.first, dark), isFalse);
      expect(
        samples.every((colors) => identical(colors, samples.first)),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('scope preserves outer tokens and unrelated theme extensions', (
    tester,
  ) async {
    final outer = AppColorTokens.light.copyWith(
      foreground: AppColorTokens.light.primary,
    );
    AppColorTokens? inside;
    AppColorTokens? outside;
    _Marker? marker;
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(extensions: [outer, const _Marker()]),
        home: Column(
          children: [
            Builder(
              builder: (context) {
                outside = AppTokens.of(context).colorScheme;
                expect(AssistantThemeScope.maybeOf(context), isNull);
                return const SizedBox();
              },
            ),
            AssistantThemeScope(
              value: const AssistantThemePreferences(
                backgroundTheme: AppearanceThemeId.ocean,
                textAccent: AppearanceAccentId.amber,
              ),
              child: Builder(
                builder: (context) {
                  inside = AppTokens.of(context).colorScheme;
                  marker = Theme.of(context).extension<_Marker>();
                  return const SizedBox();
                },
              ),
            ),
          ],
        ),
      ),
    );
    expect(identical(outside, outer), isTrue);
    expect(inside!.foreground, isNot(outer.foreground));
    expect(marker, isA<_Marker>());
    expect(tester.takeException(), isNull);
  });
}

class _Marker extends ThemeExtension<_Marker> {
  const _Marker();

  @override
  _Marker copyWith() => this;

  @override
  _Marker lerp(_Marker? other, double t) => this;
}
