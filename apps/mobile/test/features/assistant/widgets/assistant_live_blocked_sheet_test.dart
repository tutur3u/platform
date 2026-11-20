import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_live_eligibility.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_blocked_sheet.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';
import 'package:mobile/l10n/l10n.dart';

import '../../../helpers/design_render_harness.dart';

AssistantLiveEligibility _blocked(AssistantLiveBlockReason reason) =>
    AssistantLiveEligibility(
      eligible: false,
      reason: reason,
      tier: reason == AssistantLiveBlockReason.planRequired ? 'FREE' : 'PRO',
      billingName: 'Phuc personal',
      billingPersonal: true,
      balance: 120,
      minimumCredits: 500,
      resetAt: DateTime(2026, 11, 20, 17, 30),
    );

Widget _app(
  Widget child, {
  Locale locale = const Locale('en'),
  bool reducedMotion = true,
}) => MaterialApp(
  locale: locale,
  localizationsDelegates: AppLocalizations.localizationsDelegates,
  supportedLocales: AppLocalizations.supportedLocales,
  home: MediaQuery(
    data: MediaQueryData(
      size: const Size(390, 844),
      disableAnimations: reducedMotion,
    ),
    child: Scaffold(body: SingleChildScrollView(child: child)),
  ),
);

void main() {
  final l10n = AppLocalizationsEn();

  for (final reason in AssistantLiveBlockReason.values) {
    testWidgets('${reason.code}: title, body, billed-to and one primary', (
      tester,
    ) async {
      var closed = 0;
      var upsold = 0;
      final eligibility = _blocked(reason);
      await tester.pumpWidget(
        _app(
          AssistantLiveBlockedSheet(
            eligibility: eligibility,
            now: DateTime(2026, 11, 20, 9),
            onClose: () => closed++,
            onUpgrade: () async => upsold++,
            onTopUp: () async => upsold++,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text(eligibility.title(l10n)), findsOneWidget);
      expect(
        find.text(eligibility.body(l10n, now: DateTime(2026, 11, 20, 9))),
        findsOneWidget,
      );
      expect(
        find.text(l10n.assistantLiveBlockedBilledTo('Phuc personal')),
        findsOneWidget,
      );
      final upsell = switch (reason) {
        AssistantLiveBlockReason.planRequired => 'live-blocked-upgrade',
        AssistantLiveBlockReason.creditsExhausted => 'live-blocked-top-up',
        _ => null,
      };
      if (upsell != null) {
        expect(find.byKey(const ValueKey('live-blocked-not-now')), findsOne);
        await tester.tap(find.byKey(ValueKey(upsell)));
        await tester.pumpAndSettle();
        expect(upsold, 1);
        expect(closed, 1);
      } else {
        // Limits, roles and the global pause never upsell.
        expect(find.text(l10n.assistantLiveBlockedUpgrade), findsNothing);
        expect(find.text(l10n.assistantLiveBlockedTopUp), findsNothing);
        await tester.tap(find.byKey(const ValueKey('live-blocked-got-it')));
        expect(closed, 1);
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('without a store purchase flow, plan_required only dismisses', (
    tester,
  ) async {
    await tester.pumpWidget(
      _app(
        AssistantLiveBlockedSheet(
          eligibility: _blocked(AssistantLiveBlockReason.planRequired),
          onClose: () {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('live-blocked-upgrade')), findsNothing);
    expect(find.byKey(const ValueKey('live-blocked-got-it')), findsOneWidget);
  });

  testWidgets('Vietnamese copy renders without overflow', (tester) async {
    await tester.pumpWidget(
      _app(
        AssistantLiveBlockedSheet(
          eligibility: _blocked(AssistantLiveBlockReason.creditsExhausted),
          onClose: () {},
          onTopUp: () async {},
        ),
        locale: const Locale('vi'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Nạp thêm để dùng Live'), findsOneWidget);
    expect(find.text('Để sau'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  // Design renders: light/dark EN plus VI, written to DESIGN_RENDER_DIR.
  for (final theme in ['light', 'dark']) {
    for (final locale in ['en', 'vi']) {
      for (final reason in AssistantLiveBlockReason.values) {
        testWidgets('renders ${reason.code} $theme $locale', (tester) async {
          await DesignRender.loadFonts();
          DesignRender.setSize(tester, const Size(390, 560));
          final (settings, brightness) = DesignRender.themes[theme]!;
          await tester.pumpWidget(
            DesignRenderApp(
              settings: settings,
              brightness: brightness,
              child: Builder(
                builder: (context) => Localizations.override(
                  context: context,
                  locale: Locale(locale),
                  child: Align(
                    alignment: Alignment.bottomCenter,
                    child: AssistantLiveBlockedSheet(
                      eligibility: _blocked(reason),
                      now: DateTime(2026, 11, 20, 9),
                      onClose: () {},
                      onUpgrade: () async {},
                      onTopUp: () async {},
                    ),
                  ),
                ),
              ),
            ),
          );
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
          await DesignRender.capture(
            tester,
            'mira-live-blocked/$theme-$locale-${reason.code}',
          );
        });
      }
    }
  }
}
