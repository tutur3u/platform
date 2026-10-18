import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/widgets/assistant_new_chat_confirmation.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final action in ['Cancel', 'Check history', 'Start a new chat']) {
    testWidgets(
      'informed new-chat dialog returns only the chosen action: $action',
      (tester) async {
        AssistantNewChatDecision? result;
        var completed = false;
        await tester.pumpApp(
          Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result = await showAssistantNewChatConfirmation(context);
                completed = true;
              },
              child: const Text('Synthetic new chat'),
            ),
          ),
        );
        await tester.tap(find.text('Synthetic new chat'));
        await tester.pumpAndSettle();
        expect(
          find.textContaining(
            'The earlier conversation may already have been saved',
          ),
          findsOneWidget,
        );
        expect(
          find.textContaining('does not retry the earlier request'),
          findsOneWidget,
        );
        expect(completed, isFalse);
        await tester.tap(
          find.widgetWithText(TextButton, action).evaluate().isEmpty
              ? find.widgetWithText(FilledButton, action)
              : find.widgetWithText(TextButton, action),
        );
        await tester.pumpAndSettle();
        expect(completed, isTrue);
        expect(result, switch (action) {
          'Start a new chat' => AssistantNewChatDecision.createNew,
          'Check history' => AssistantNewChatDecision.inspectHistory,
          _ => null,
        });
        expect(tester.takeException(), isNull);
      },
    );
  }
  for (final action in ['Done', 'Check history']) {
    testWidgets('reset status retains uncertainty until choice: $action', (
      tester,
    ) async {
      bool? inspect;
      await tester.pumpApp(
        Builder(
          builder: (context) => TextButton(
            onPressed: () async {
              inspect = await showAssistantNewChatResetStatus(
                context,
                message: 'Synthetic uncertain reset. No automatic retry.',
              );
            },
            child: const Text('Synthetic reset status'),
          ),
        ),
      );
      await tester.tap(find.text('Synthetic reset status'));
      await tester.pumpAndSettle();
      expect(inspect, isNull);
      expect(
        find.text('Synthetic uncertain reset. No automatic retry.'),
        findsOneWidget,
      );
      expect(find.byType(FilledButton), findsNothing);
      await tester.tap(find.widgetWithText(TextButton, action));
      await tester.pumpAndSettle();
      expect(inspect, action == 'Check history');
      expect(find.byType(AlertDialog), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
