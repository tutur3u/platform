import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_reply_preview.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_scroll_follower.dart';
import 'package:mobile/features/assistant/widgets/assistant_transcript_section.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final retired in [false, true]) {
    testWidgets('reply preview jumps to loaded target retired=$retired', (
      tester,
    ) async {
      final controller = ScrollController();
      addTearDown(controller.dispose);
      final follower = AssistantTranscriptScrollFollower(
        controller: controller,
        onVisibilityChanged: (_) {},
      );
      controller.addListener(follower.observeScroll);
      addTearDown(follower.dispose);
      var current = true;
      final messages = [
        for (var i = 0; i < 35; i++)
          AssistantMessage(
            id: 'message-$i',
            role: 'user',
            parts: [AssistantMessagePart(type: 'text', text: 'Answer $i')],
          ),
        const AssistantMessage(
          id: 'reply',
          role: 'user',
          replyToMessageId: 'message-0',
          parts: [AssistantMessagePart(type: 'text', text: 'Follow-up')],
        ),
      ];
      await tester.pumpApp(
        Scaffold(
          body: NotificationListener<ScrollNotification>(
            onNotification: follower.observeNotification,
            child: SingleChildScrollView(
              controller: controller,
              child: AssistantTranscriptSection(
                chatState: AssistantChatState(
                  fallbackChatId: 'chat',
                  messages: messages,
                ),
                liveState: const AssistantLiveState(),
                assistantName: 'Mira',
                isActionCurrent: () => current,
                onJumpToReply: follower.suspend,
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      controller.jumpTo(controller.position.maxScrollExtent);
      await tester.pumpAndSettle();
      final offset = controller.offset;
      expect(offset, greaterThan(1000));
      current = !retired;
      await tester.tap(
        find.byKey(const ValueKey('assistant-reply-target-reply')),
      );
      await tester.pumpAndSettle();
      follower.followUpdate();
      await tester.pumpAndSettle();
      expect(controller.offset, retired ? offset : lessThan(1));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('acknowledgment relocation keeps expanded message state', (
    tester,
  ) async {
    final text = List.filled(30, 'A long original message.').join(' ');
    var message = AssistantMessage(
      id: 'optimistic',
      role: 'user',
      clientRequestId: 'stable-request',
      parts: [AssistantMessagePart(type: 'text', text: text)],
    );
    late StateSetter update;
    await tester.pumpApp(
      Scaffold(
        body: SingleChildScrollView(
          child: StatefulBuilder(
            builder: (context, setState) {
              update = setState;
              return AssistantTranscriptSection(
                chatState: AssistantChatState(
                  fallbackChatId: 'chat',
                  messages: [message],
                ),
                liveState: const AssistantLiveState(),
                assistantName: 'Mira',
              );
            },
          ),
        ),
      ),
    );
    await tester.tap(find.text('See more'));
    await tester.pumpAndSettle();
    expect(find.text('See less'), findsOneWidget);
    update(() => message = message.copyWith(id: 'saved', isPersisted: true));
    await tester.pumpAndSettle();
    expect(find.text('See less'), findsOneWidget);
    expect(find.text('See more'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('missing reply target has no jump action', (tester) async {
    await tester.pumpApp(
      const Scaffold(
        body: SingleChildScrollView(
          child: AssistantTranscriptSection(
            chatState: AssistantChatState(
              fallbackChatId: 'chat',
              messages: [
                AssistantMessage(
                  id: 'reply',
                  role: 'user',
                  replyToMessageId: 'not-loaded',
                  parts: [AssistantMessagePart(type: 'text', text: 'Reply')],
                ),
              ],
            ),
            liveState: AssistantLiveState(),
            assistantName: 'Mira',
          ),
        ),
      ),
    );
    final preview = tester.widget<AssistantReplyPreview>(
      find.byType(AssistantReplyPreview),
    );
    expect(preview.onTap, isNull);
    expect(tester.takeException(), isNull);
  });
}
