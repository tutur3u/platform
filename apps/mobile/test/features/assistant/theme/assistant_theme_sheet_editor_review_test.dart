import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/components/app_slider.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_controller.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preferences.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_preview.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_sheet.dart';
import 'package:mobile/features/assistant/theme/assistant_theme_store.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../widgets/assistant_component_raster.dart';

void main() {
  setUpAll(loadAssistantRenderFonts);
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('controlled editor previews two ticks and flushes on release', (
    tester,
  ) async {
    final actor = ValueNotifier<AssistantThemeActor?>(AssistantThemeActor('a'));
    final controller = AssistantThemeController(actor: actor);
    addTearDown(() {
      controller.dispose();
      actor.dispose();
    });
    await controller.reload();
    await controller.setValue(
      const AssistantThemePreferences(
        backgroundStyle: AssistantBackgroundStyle.gradient,
      ),
    );
    await tester.pumpWidget(_app(controller));
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await _expand(tester);
    final sliderFinder = find.byKey(
      const ValueKey('assistant-theme-intensity'),
    );
    await tester.ensureVisible(sliderFinder);
    final slider = tester.widget<AppSlider>(sliderFinder);
    slider.onChanged!(0.2);
    slider.onChanged!(0.9);
    expect(controller.value.intensity, 0.9);
    final prefs = await SharedPreferences.getInstance();
    expect(_stored(prefs).intensity, 0.6);
    await tester.pump();
    final preview = tester.widget<AssistantThemePreview>(
      find.byType(AssistantThemePreview),
    );
    expect(preview.value.intensity, 0.9);
    slider.onChangeEnd!(0.9);
    await tester.pump();
    expect(_stored(prefs).intensity, 0.9);

    await tester.ensureVisible(sliderFinder);
    final rect = tester.getRect(sliderFinder);
    Offset point(double fraction) =>
        Offset(rect.left + 10 + (rect.width - 20) * fraction, rect.center.dy);
    final gesture = await tester.startGesture(point(0.2));
    await gesture.moveTo(point(0.4));
    await gesture.moveTo(point(0.7));
    await gesture.moveTo(point(0.8));
    await gesture.up();
    await tester.pump();
    expect(controller.value.intensity, closeTo(0.8, 0.001));
    expect(_stored(prefs).intensity, 0.8);
    await tester.pump(const Duration(seconds: 1));
    expect(tester.takeException(), isNull);
  });

  for (final language in ['en', 'vi']) {
    testWidgets('theme sheet remains usable at 3x in compact $language', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(320, 568);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetPhysicalSize);
      final prefs = await SharedPreferences.getInstance();
      var fail = false;
      final actor = ValueNotifier<AssistantThemeActor?>(
        AssistantThemeActor('a'),
      );
      final controller = AssistantThemeController(
        actor: actor,
        store: AssistantThemeStore(
          preferences: () async {
            if (fail) throw StateError('unavailable');
            return prefs;
          },
        ),
      );
      addTearDown(() {
        controller.dispose();
        actor.dispose();
      });
      await controller.reload();
      fail = true;
      await controller.setValue(
        const AssistantThemePreferences(
          backgroundStyle: AssistantBackgroundStyle.gradient,
          intensity: 0.8,
        ),
      );
      await tester.pumpWidget(
        _app(controller, locale: Locale(language), textScale: 3),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      final l10n = AppLocalizations.of(
        tester.element(find.byType(AssistantThemeSheet)),
      );
      expect(find.text(l10n.assistantThemeTitle), findsOneWidget);
      expect(find.text(l10n.assistantThemeStorageError), findsOneWidget);
      expect(tester.takeException(), isNull);

      final retry = find.text(l10n.assistantThemeRetry);
      await tester.ensureVisible(retry);
      await tester.pumpAndSettle();
      expect(retry.hitTestable(), findsOneWidget);
      fail = false;
      await tester.tap(retry);
      await tester.pumpAndSettle();
      expect(controller.storageFailed, isFalse);
      expect(_stored(prefs).intensity, 0.8);
      await _expand(tester);
      final slider = find.byKey(const ValueKey('assistant-theme-intensity'));
      await tester.ensureVisible(slider);
      await tester.pumpAndSettle();
      expect(slider.hitTestable(), findsOneWidget);
      final control = tester.widget<AppSlider>(slider);
      control.onChanged!(0.4);
      control.onChangeEnd!(0.4);
      await tester.pumpAndSettle();
      expect(controller.value.intensity, 0.4);
      expect(tester.takeException(), isNull);

      final reset = find.text(l10n.assistantThemeReset);
      await tester.ensureVisible(reset);
      await tester.pumpAndSettle();
      expect(reset.hitTestable(), findsOneWidget);
      final viewport = tester.getRect(find.byType(Scaffold).first);
      final resetRect = tester.getRect(reset);
      expect(resetRect.left, greaterThanOrEqualTo(viewport.left));
      expect(resetRect.right, lessThanOrEqualTo(viewport.right));
      expect(resetRect.bottom, lessThanOrEqualTo(viewport.bottom));
      await tester.tap(reset);
      await tester.pumpAndSettle();
      expect(controller.value, const AssistantThemePreferences());
      await tester.pump(const Duration(milliseconds: 300));
      expect(_stored(prefs), const AssistantThemePreferences());
      expect(tester.takeException(), isNull);
    });
  }
}

Future<void> _expand(WidgetTester tester) async {
  final l10n = AppLocalizations.of(
    tester.element(find.byType(AssistantThemeSheet)),
  );
  final advanced = find.text(l10n.assistantThemeAdvanced);
  await tester.ensureVisible(advanced);
  await tester.pumpAndSettle();
  await tester.tap(advanced);
  await tester.pumpAndSettle();
}

Widget _app(
  AssistantThemeController controller, {
  Locale locale = const Locale('en'),
  double textScale = 1,
}) => MaterialApp(
  locale: locale,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  builder: (context, child) => MediaQuery(
    data: MediaQuery.of(
      context,
    ).copyWith(textScaler: TextScaler.linear(textScale)),
    child: child!,
  ),
  home: Scaffold(
    body: Builder(
      builder: (context) => TextButton(
        onPressed: () => unawaited(
          showAppSheet<void>(
            context: context,
            builder: (_) =>
                AssistantThemeSheet.controlled(controller: controller),
          ),
        ),
        child: const Text('Open'),
      ),
    ),
  ),
);

AssistantThemePreferences _stored(SharedPreferences prefs) =>
    AssistantThemePreferences.decode(
      prefs.getString(AssistantThemeStore.keyFor('a')),
    );
