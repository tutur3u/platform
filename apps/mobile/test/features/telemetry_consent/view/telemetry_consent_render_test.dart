import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/observability/telemetry_preference.dart';
import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/core/theme/sorbet/sorbet_theme.dart';
import 'package:mobile/features/telemetry_consent/view/telemetry_consent_page.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/design_render_harness.dart';

/// Sorbet light/dark renders of the consent prompt. Assertions always run;
/// PNGs are written only when `DESIGN_RENDER_DIR` is set.
Future<void> _pump(
  WidgetTester tester, {
  required Brightness brightness,
  Locale locale = const Locale('en'),
  Size size = const Size(390, 844),
  double textScale = 1,
}) async {
  SharedPreferences.setMockInitialValues({});
  final preference = TelemetryPreference();
  await preference.initialize(
    promptEligible: true,
    apply: ({required enabled}) async {},
  );
  DesignRender.setSize(tester, size);
  await tester.pumpWidget(
    RepaintBoundary(
      key: DesignRenderApp.boundaryKey,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: SorbetAppTheme.materialTheme(const SorbetTheme(), brightness),
        locale: locale,
        localizationsDelegates: AppLocalizations.localizationsDelegates,
        supportedLocales: AppLocalizations.supportedLocales,
        home: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(context).copyWith(
              textScaler: TextScaler.linear(textScale),
              padding: const EdgeInsets.only(top: 47, bottom: 34),
            ),
            child: TelemetryConsentPage(preference: preference),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

/// Both answers are fully inside the viewport, so neither needs a scroll.
void _expectAnswersOnScreen(
  WidgetTester tester,
  Size size,
  AppLocalizations l10n,
) {
  for (final label in [l10n.telemetryConsentAllow, l10n.telemetryConsentDeny]) {
    final rect = tester.getRect(find.text(label));
    expect(rect.top, greaterThanOrEqualTo(0), reason: label);
    expect(rect.bottom, lessThanOrEqualTo(size.height), reason: label);
  }
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in Brightness.values) {
    for (final locale in const [Locale('en'), Locale('vi')]) {
      testWidgets('${brightness.name} ${locale.languageCode} phone', (
        tester,
      ) async {
        await _pump(tester, brightness: brightness, locale: locale);
        final l10n = lookupAppLocalizations(locale);
        _expectAnswersOnScreen(tester, const Size(390, 844), l10n);
        await DesignRender.capture(
          tester,
          'telemetry-consent/${brightness.name}-${locale.languageCode}',
          pixelRatio: 2,
        );
        final details = find.text(l10n.telemetryConsentDetails);
        await tester.ensureVisible(details);
        await tester.pumpAndSettle();
        await tester.tap(details);
        await tester.pumpAndSettle();
        expect(find.text(l10n.telemetryConsentBody), findsOneWidget);
        await DesignRender.capture(
          tester,
          'telemetry-consent/${brightness.name}-${locale.languageCode}-details',
          pixelRatio: 2,
        );
      });
    }
  }

  for (final (brightness, locale) in const [
    (Brightness.light, Locale('en')),
    (Brightness.dark, Locale('vi')),
  ]) {
    final tag = '${brightness.name}-${locale.languageCode}';
    testWidgets('$tag small phone at 2x text scrolls cleanly', (tester) async {
      const size = Size(320, 568);
      await _pump(
        tester,
        brightness: brightness,
        locale: locale,
        size: size,
        textScale: 2,
      );
      final l10n = lookupAppLocalizations(locale);
      // Layout overflow would already have failed the pump.
      _expectAnswersOnScreen(tester, size, l10n);
      await DesignRender.capture(
        tester,
        'telemetry-consent/$tag-small-2x',
        pixelRatio: 2,
      );
      final privacy = find.text(l10n.telemetryConsentLearnMore);
      await tester.scrollUntilVisible(
        privacy,
        120,
        scrollable: find.byType(Scrollable).first,
      );
      expect(
        tester.getRect(privacy).bottom,
        lessThanOrEqualTo(
          tester.getRect(find.text(l10n.telemetryConsentAllow)).top,
        ),
      );
      expect(find.text(l10n.telemetryConsentAccountTitle), findsOneWidget);
      await DesignRender.capture(
        tester,
        'telemetry-consent/$tag-small-2x-end',
        pixelRatio: 2,
      );
    });
  }
}
