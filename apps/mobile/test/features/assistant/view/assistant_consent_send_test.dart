import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';

import '../consent/mira_ai_consent_fakes.dart';
import 'background_reply_harness.dart';

const _sheet = ValueKey('mira-consent-sheet');

void main() {
  testWidgets(
    'the first Mira send asks; Not now keeps the draft; Allow sends',
    (tester) async {
      final h = BackgroundReplyHarness();
      final consent = FakeMiraAiConsentRepository();
      final controller = fakeConsentController(
        consent,
        currentUserId: () => h.auth.state.user?.id,
      );
      addTearDown(controller.dispose);
      addTearDown(() => h.dispose(tester));
      await h.mount(tester, aiConsent: controller);
      final draft = tester
          .widget<AssistantComposerDock>(find.byType(AssistantComposerDock))
          .controller;

      draft.text = 'Synthetic question';
      await tester.pump();
      await tester.tap(find.byKey(const ValueKey('assistant-send')));
      await tester.pumpAndSettle();
      expect(find.byKey(_sheet), findsOneWidget);
      expect(h.repository.starts, 0);

      await tester.tap(find.byKey(const ValueKey('mira-consent-not-now')));
      await tester.pumpAndSettle();
      expect(find.byKey(_sheet), findsNothing);
      expect(draft.text, 'Synthetic question');
      expect(h.repository.starts, 0);
      expect(consent.saves, isEmpty);

      await tester.tap(find.byKey(const ValueKey('assistant-send')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('mira-consent-allow')));
      for (var i = 0; i < 8 && h.repository.starts == 0; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(consent.saves, [(granted: true, source: 'mobile_mira_prompt')]);
      expect(h.repository.starts, 1);
      expect(draft.text, isEmpty);

      // Consent withdrawn on another device: the server refuses and the
      // page forgets its cached grant and asks again.
      h.repository.stream.addError(
        const ApiException(
          message: 'ai_consent_required',
          statusCode: 403,
          code: 'ai_consent_required',
        ),
      );
      await tester.pumpAndSettle();
      expect(controller.granted, isFalse);
      expect(find.byKey(_sheet), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('mira-consent-not-now')));
      await tester.pumpAndSettle();
      expect(h.repository.starts, 1);
    },
  );
}
