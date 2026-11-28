import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_sheet.dart';
import 'package:mobile/features/settings/view/mira_ai_consent_settings_tile.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import '../../assistant/consent/mira_ai_consent_fakes.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('the switch revokes, and the next send asks again', (
    tester,
  ) async {
    final repository = FakeMiraAiConsentRepository(
      server: MiraAiConsent(
        granted: true,
        grantedAt: DateTime.utc(2026, 11, 28, 9),
      ),
    );
    final controller = fakeConsentController(repository);
    addTearDown(controller.dispose);
    final answers = <bool>[];
    await tester.pumpApp(
      Column(
        children: [
          MiraAiConsentSettingsTile(controller: controller),
          Builder(
            builder: (context) => TextButton(
              onPressed: () async =>
                  answers.add(await ensureMiraAiConsent(context, controller)),
              child: const Text('Send to Mira'),
            ),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Share data with Google Gemini'), findsOneWidget);
    expect(find.textContaining('Allowed'), findsOneWidget);
    expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).value, isTrue);

    await tester.tap(find.byType(AppSwitch));
    await tester.pumpAndSettle();
    expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).value, isFalse);
    expect(repository.saves, [(granted: false, source: 'mobile_settings')]);
    expect(controller.granted, isFalse);
    expect(
      find.textContaining("Needed for Mira's cloud replies"),
      findsOneWidget,
    );

    await tester.tap(find.text('Send to Mira'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('mira-consent-sheet')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('mira-consent-not-now')));
    await tester.pumpAndSettle();
    expect(answers, [false]);

    expect(
      find.textContaining('stops Mira from sending anything new to Google'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('turning it on from Settings records the Settings source', (
    tester,
  ) async {
    final repository = FakeMiraAiConsentRepository();
    final controller = fakeConsentController(repository);
    addTearDown(controller.dispose);
    await tester.pumpApp(MiraAiConsentSettingsTile(controller: controller));
    await tester.pumpAndSettle();

    expect(tester.widget<AppSwitch>(find.byType(AppSwitch)).value, isFalse);
    await tester.tap(find.text('Share data with Google Gemini'));
    await tester.pumpAndSettle();
    expect(repository.saves, [(granted: true, source: 'mobile_settings')]);
    expect(controller.granted, isTrue);
  });
}
