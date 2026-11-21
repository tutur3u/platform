import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/platform/apple_store_policy.dart';
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

  for (final platform in [
    TargetPlatform.iOS,
    TargetPlatform.macOS,
    TargetPlatform.android,
  ]) {
    for (final reason in AssistantLiveBlockReason.values) {
      testWidgets('${reason.code} on ${platform.name}: copy and one primary', (
        tester,
      ) async {
        var closed = 0;
        var opened = 0;
        final eligibility = _blocked(reason);
        await tester.pumpWidget(
          _app(
            AssistantLiveBlockedSheet(
              eligibility: eligibility,
              platform: platform,
              now: DateTime(2026, 11, 20, 9),
              onClose: () => closed++,
              onOpenBilling: () async => opened++,
            ),
          ),
        );
        await tester.pumpAndSettle();
        final apple = isAppleStorePlatform(platform);
        final title = eligibility.title(l10n, platform: platform);
        final body = eligibility.body(
          l10n,
          now: DateTime(2026, 11, 20, 9),
          platform: platform,
        );
        expect(find.text(title), findsOneWidget);
        expect(find.text(body), findsOneWidget);
        if (apple && title != eligibility.title(l10n)) {
          expect(find.text(eligibility.title(l10n)), findsNothing);
        }
        expect(
          find.text(l10n.assistantLiveBlockedBilledTo('Phuc personal')),
          findsOneWidget,
        );
        final billing =
            reason == AssistantLiveBlockReason.planRequired ||
            reason == AssistantLiveBlockReason.creditsExhausted;
        if (billing && platform == TargetPlatform.android) {
          expect(find.byKey(const ValueKey('live-blocked-not-now')), findsOne);
          await tester.tap(
            find.byKey(const ValueKey('live-blocked-open-billing')),
          );
          await tester.pumpAndSettle();
          expect(opened, 1);
          expect(closed, 1);
          return;
        }
        // Apple store builds never offer purchase; limits, roles and pauses
        // never upsell.
        expect(
          find.byKey(const ValueKey('live-blocked-open-billing')),
          findsNothing,
        );
        expect(find.text(l10n.assistantLiveBlockedManageOnWeb), findsNothing);
        await tester.tap(find.byKey(const ValueKey('live-blocked-got-it')));
        expect(closed, 1);
        expect(opened, 0);
        expect(tester.takeException(), isNull);
      });
    }
  }

  test('Android billing opens the billed workspace on the pay app', () {
    expect(
      assistantLiveBillingUri('ws 1').toString(),
      'https://pay.tuturuuu.com/ws%201/billing',
    );
  });

  testWidgets('Vietnamese copy renders without overflow', (tester) async {
    await tester.pumpWidget(
      _app(
        AssistantLiveBlockedSheet(
          eligibility: _blocked(AssistantLiveBlockReason.creditsExhausted),
          platform: TargetPlatform.iOS,
          onClose: () {},
        ),
        locale: const Locale('vi'),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Không đủ tín dụng để dùng Live'), findsOneWidget);
    expect(
      find.text('Quản lý gói của bạn trên web tại tuturuuu.com.'),
      findsNothing,
    );
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
                      platform: TargetPlatform.iOS,
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
