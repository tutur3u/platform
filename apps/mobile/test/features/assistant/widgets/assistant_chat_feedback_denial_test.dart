import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/safe_error_diagnostics.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/models/assistant_reply_failure.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';

import '../../../helpers/pump_app.dart';

void main() {
  testWidgets('Android shows Upgrade and Learn more for credit denials', (
    tester,
  ) async {
    var billingTapped = false;
    AssistantReplyFailure? learnedFailure;

    await tester.pumpApp(
      Scaffold(
        body: AssistantChatFeedback(
          platform: TargetPlatform.android,
          state: AssistantChatState(
            fallbackChatId: 'chat-1',
            status: AssistantChatStatus.error,
            diagnostics: SafeErrorDiagnostics.streamError(
              status: 403,
              code: 'CREDITS_EXHAUSTED',
            ),
          ),
          onOpenBilling: () => billingTapped = true,
          onLearnMore: (failure) => learnedFailure = failure,
        ),
      ),
    );

    expect(
      find.byKey(const ValueKey('assistant-reply-failure-credits')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('assistant-reply-failure-upgrade')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('assistant-reply-failure-learn-more')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey('assistant-reply-failure-upgrade')),
    );
    await tester.tap(
      find.byKey(const ValueKey('assistant-reply-failure-learn-more')),
    );
    expect(billingTapped, isTrue);
    expect(learnedFailure, AssistantReplyFailure.credits);
  });

  testWidgets('iOS hides external Upgrade action while keeping Learn more', (
    tester,
  ) async {
    AssistantReplyFailure? learnedFailure;

    await tester.pumpApp(
      Scaffold(
        body: AssistantChatFeedback(
          platform: TargetPlatform.iOS,
          state: AssistantChatState(
            fallbackChatId: 'chat-1',
            status: AssistantChatStatus.error,
            diagnostics: SafeErrorDiagnostics.streamError(
              status: 403,
              code: 'MODEL_NOT_ALLOWED',
            ),
          ),
          onOpenBilling: () {},
          onLearnMore: (failure) => learnedFailure = failure,
        ),
      ),
    );

    expect(
      find.byKey(const ValueKey('assistant-reply-failure-plan')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('assistant-reply-failure-upgrade')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('assistant-reply-failure-learn-more')),
      findsOneWidget,
    );

    await tester.tap(
      find.byKey(const ValueKey('assistant-reply-failure-learn-more')),
    );
    expect(learnedFailure, AssistantReplyFailure.plan);
  });

  testWidgets('permission denials show Learn more without Upgrade on Android', (
    tester,
  ) async {
    await tester.pumpApp(
      Scaffold(
        body: AssistantChatFeedback(
          platform: TargetPlatform.android,
          state: AssistantChatState(
            fallbackChatId: 'chat-1',
            status: AssistantChatStatus.error,
            diagnostics: SafeErrorDiagnostics.streamError(
              status: 403,
              code: 'WORKSPACE_ACCESS_DENIED',
            ),
          ),
          onOpenBilling: () {},
          onLearnMore: (_) {},
        ),
      ),
    );

    expect(
      find.byKey(const ValueKey('assistant-reply-failure-access')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('assistant-reply-failure-upgrade')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('assistant-reply-failure-learn-more')),
      findsOneWidget,
    );
  });
}
