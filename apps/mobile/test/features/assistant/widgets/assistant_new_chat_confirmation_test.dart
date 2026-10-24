import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
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
            builder: (context) => AppButton.ghost(
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
        final button = find.widgetWithText(AppButton, action);
        expect(button, findsOneWidget);
        expect(
          tester.widget<AppButton>(button).variant,
          action == 'Start a new chat'
              ? AppButtonVariant.primary
              : AppButtonVariant.ghost,
        );
        expect(
          find.byWidgetPredicate(
            (widget) =>
                widget is AppButton &&
                widget.variant == AppButtonVariant.primary,
          ),
          findsOneWidget,
        );
        await tester.tap(button);
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
          builder: (context) => AppButton.ghost(
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
      expect(
        find.byWidgetPredicate(
          (widget) =>
              widget is AppButton && widget.variant == AppButtonVariant.primary,
        ),
        findsNothing,
      );
      await tester.tap(find.widgetWithText(AppButton, action));
      await tester.pumpAndSettle();
      expect(inspect, action == 'Check history');
      expect(find.byType(AppDialog), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
