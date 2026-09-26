import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_composer.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';

import '../../helpers/helpers.dart';

void main() {
  testWidgets('message actions stay compact and preserve reactions', (
    tester,
  ) async {
    String? reaction;
    await tester.pumpApp(
      SizedBox(
        height: 600,
        child: ChatThreadView(
          conversation: ChatConversation(
            id: 'conversation',
            wsId: 'workspace',
            type: ChatConversationType.direct,
            updatedAt: DateTime(2026),
            title: 'Friend',
          ),
          messages: [
            ChatMessage(
              id: 'message',
              conversationId: 'conversation',
              content: 'Hello',
              kind: ChatMessageKind.user,
              createdAt: DateTime(2026),
            ),
          ],
          messageStatus: ChatMessageStatus.loaded,
          currentUserId: 'user',
          pendingAttachments: const [],
          streamingAssistantText: '',
          isSending: false,
          isUploadingAttachment: false,
          onSend: (_) {},
          onPickAttachment: (_) async {},
          onRemoveAttachment: (_) {},
          onReaction: (_, value) => reaction = value,
          onDetails: () {},
          onPin: () {},
        ),
      ),
    );
    expect(find.text('Hello'), findsOneWidget);
    expect(find.text('+1'), findsNothing);
    await tester.tap(find.byIcon(Icons.add_reaction_outlined));
    await tester.pumpAndSettle();
    await tester.tap(find.text('+1'));
    expect(reaction, '+1');
  });

  for (final size in [const Size(402, 874), const Size(874, 1032)]) {
    for (final height in [100.0, 200.0, 700.0]) {
      testWidgets(
        'error thread keeps composer reachable at height $height in $size',
        (tester) async {
          tester.view.devicePixelRatio = 1;
          tester.view.physicalSize = size;
          addTearDown(tester.view.reset);
          await tester.pumpApp(
            Align(
              alignment: Alignment.topCenter,
              child: SizedBox(
                height: height,
                child: ChatThreadView(
                  conversation: ChatConversation(
                    id: 'conversation',
                    wsId: 'workspace',
                    type: ChatConversationType.ai,
                    updatedAt: DateTime(2026),
                    title: 'Conversation',
                  ),
                  messages: const [],
                  messageStatus: ChatMessageStatus.error,
                  currentUserId: 'user',
                  pendingAttachments: const [],
                  streamingAssistantText: '',
                  isSending: false,
                  isUploadingAttachment: false,
                  onSend: (_) {},
                  onPickAttachment: (_) async {},
                  onRemoveAttachment: (_) {},
                  onReaction: (_, _) {},
                  onDetails: () {},
                  onPin: () {},
                ),
              ),
            ),
          );
          await tester.pump();
          expect(tester.takeException(), isNull);
          if (height == 700) {
            final title = find.text('Something went wrong');
            final center = find
                .ancestor(of: title, matching: find.byType(Center))
                .first;
            final scroll = find
                .ancestor(
                  of: title,
                  matching: find.byType(SingleChildScrollView),
                )
                .first;
            expect(
              tester.getCenter(scroll).dy,
              closeTo(tester.getCenter(center).dy, 1),
            );
          }
          expect(find.byType(ChatComposer).hitTestable(), findsOneWidget);
          expect(
            tester.getBottomLeft(find.byType(ChatComposer)).dy,
            lessThanOrEqualTo(height),
          );
        },
      );
    }
  }
}
