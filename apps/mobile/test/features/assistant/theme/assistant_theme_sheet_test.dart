import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/ui/components/app_disclosure.dart';
import 'package:mobile/core/ui/components/app_select.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_scope.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_sheet.dart';
import 'package:mobile/l10n/l10n.dart';
import '../widgets/assistant_component_raster.dart';

void main() {
  setUpAll(loadAssistantRenderFonts);
  testWidgets('Advanced starts collapsed and presets update the whole value', (
    tester,
  ) async {
    configureAssistantRaster(tester);
    var value = const AssistantThemePreferences();
    await tester.pumpWidget(
      MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: StatefulBuilder(
            builder: (context, update) => AssistantThemeSheet(
              value: value,
              onChanged: (next) => update(() => value = next),
            ),
          ),
        ),
      ),
    );
    expect(find.byType(AppDisclosure), findsOneWidget);
    expect(
      find.byKey(const ValueKey('assistant-theme-messages')),
      findsNothing,
    );
    expect(find.byKey(const ValueKey('assistant-theme-text')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('assistant-theme-preset')));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Ocean'));
    await tester.tap(find.text('Ocean'));
    await tester.pumpAndSettle();
    expect(value, AssistantThemePreferences.preset(AppearanceThemeId.ocean));
    await renderAssistantComponent(tester, 'assistant-theme-presets');
    expect(
      find.byKey(const ValueKey('assistant-theme-messages')),
      findsNothing,
    );

    await tester.ensureVisible(find.text('Advanced'));
    await tester.tap(find.text('Advanced'));
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('assistant-theme-messages')),
      findsOneWidget,
    );
    final text = find.byKey(const ValueKey('assistant-theme-text'));
    await tester.ensureVisible(text);
    await tester.tap(text);
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Rose'),
      120,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Rose'));
    await tester.pumpAndSettle();
    expect(value.textAccent, AppearanceAccentId.rose);
    expect(value.messageTheme, AppearanceThemeId.ocean);
    expect(value.backgroundTheme, AppearanceThemeId.ocean);
    expect(value.backgroundStyle, AssistantBackgroundStyle.gradient);
    await renderAssistantComponent(tester, 'assistant-theme-advanced');
    expect(tester.takeException(), isNull);

    final reset = find.text('Reset appearance');
    await tester.ensureVisible(reset);
    await tester.tap(reset);
    await tester.pumpAndSettle();
    expect(value, const AssistantThemePreferences());
  });

  testWidgets('read-only sheet disables the preset picker', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Scaffold(
          body: AssistantThemeSheet(
            value: AssistantThemePreferences(),
            onChanged: null,
          ),
        ),
      ),
    );
    final preset = tester.widget<AppSelect<AppearanceThemeId>>(
      find.byKey(const ValueKey('assistant-theme-preset')),
    );
    expect(preset.onChanged, isNull);
    await tester.tap(find.byKey(const ValueKey('assistant-theme-preset')));
    await tester.pumpAndSettle();
    expect(find.text('Ocean'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'scope updates bubble colors and backdrop with value and brightness',
    (tester) async {
      final value = AssistantThemePreferences.preset(AppearanceThemeId.aurora);
      Color? foreground;
      Widget app(
        Brightness brightness,
        AssistantThemePreferences preferences,
      ) => MaterialApp(
        theme: ThemeData(brightness: brightness),
        home: AssistantThemeScope(
          value: preferences,
          child: AssistantThemeBackdrop(
            child: Builder(
              builder: (context) {
                foreground = AssistantThemeScope.of(
                  context,
                ).userMessage.foreground;
                return const SizedBox.expand();
              },
            ),
          ),
        ),
      );
      await tester.pumpWidget(app(Brightness.light, value));
      final light = foreground;
      await tester.pumpWidget(app(Brightness.dark, value));
      await tester.pumpAndSettle();
      expect(foreground, isNot(light));
      await tester.pumpWidget(
        app(Brightness.dark, const AssistantThemePreferences()),
      );
      await tester.pumpAndSettle();
      final backdrop = tester.widget<DecoratedBox>(
        find
            .descendant(
              of: find.byType(AssistantThemeBackdrop),
              matching: find.byType(DecoratedBox),
            )
            .first,
      );
      expect((backdrop.decoration as BoxDecoration).gradient, isNull);
    },
  );
}
