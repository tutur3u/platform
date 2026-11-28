import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_controller.dart';
import 'package:mobile/features/assistant/consent/mira_ai_consent_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';
import 'mira_ai_consent_fakes.dart';

void main() {
  late FakeMiraAiConsentRepository repository;
  late MiraAiConsentController controller;
  late List<bool> answers;
  late List<Uri> opened;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    repository = FakeMiraAiConsentRepository();
    controller = fakeConsentController(repository);
    answers = [];
    opened = [];
  });

  tearDown(() => controller.dispose());

  Future<void> pumpAsk(WidgetTester tester) => tester.pumpApp(
    Builder(
      builder: (context) => Center(
        child: TextButton(
          onPressed: () async => answers.add(
            await ensureMiraAiConsent(
              context,
              controller,
              launch: (uri, _) async {
                opened.add(uri);
                return true;
              },
            ),
          ),
          child: const Text('Ask'),
        ),
      ),
    ),
  );

  testWidgets('shows the disclosure and Not now sends nothing', (tester) async {
    await pumpAsk(tester);
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('mira-consent-sheet')), findsOneWidget);
    expect(find.text('Share data with Google Gemini?'), findsOneWidget);
    expect(find.textContaining('Google Gemini models'), findsOneWidget);
    expect(find.text('What is sent'), findsOneWidget);
    for (final label in ['Text', 'Voice', 'Camera', 'Screen']) {
      expect(find.textContaining(label, findRichText: true), findsWidgets);
    }
    expect(find.textContaining('Settings › Privacy'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('mira-consent-privacy')));
    await tester.pumpAndSettle();
    expect(opened.single, Uri.parse('https://tuturuuu.com/privacy'));

    await tester.tap(find.byKey(const ValueKey('mira-consent-not-now')));
    await tester.pumpAndSettle();
    expect(answers, [false]);
    expect(repository.saves, isEmpty);
    expect(controller.granted, isFalse);
  });

  testWidgets('Allow stores consent before resolving', (tester) async {
    await pumpAsk(tester);
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('mira-consent-allow')));
    await tester.pumpAndSettle();

    expect(answers, [true]);
    expect(repository.saves, [(granted: true, source: 'mobile_mira_prompt')]);
    expect(controller.granted, isTrue);
    expect(find.byKey(const ValueKey('mira-consent-sheet')), findsNothing);
  });

  testWidgets('a failed Allow keeps the sheet open and grants nothing', (
    tester,
  ) async {
    repository.failSave = true;
    await pumpAsk(tester);
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('mira-consent-allow')));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('mira-consent-error')), findsOneWidget);
    expect(answers, isEmpty);
    expect(controller.granted, isFalse);
  });

  testWidgets('a held server grant answers without the sheet', (tester) async {
    repository.server = const MiraAiConsent(granted: true);
    await pumpAsk(tester);
    await tester.tap(find.text('Ask'));
    await tester.pumpAndSettle();

    expect(find.byKey(const ValueKey('mira-consent-sheet')), findsNothing);
    expect(answers, [true]);
    expect(repository.fetches, 1);
  });
}
