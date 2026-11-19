import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_conversation_list.dart';

import '../../helpers/helpers.dart';

void main() {
  testWidgets('ai row previews the last message instead of an AI label', (
    tester,
  ) async {
    await tester.pumpApp(
      SizedBox(
        height: 240,
        child: ChatConversationList(
          conversations: [
            ChatConversation(
              id: 'ai',
              wsId: 'workspace',
              type: ChatConversationType.ai,
              updatedAt: DateTime(2026, 11, 19, 9),
              title: 'Mira',
              unreadCount: 2,
              latestMessage: ChatMessage(
                id: 'message',
                conversationId: 'ai',
                content: 'Draft the agenda',
                kind: ChatMessageKind.assistant,
                createdAt: DateTime(2026, 11, 19, 9),
              ),
            ),
          ],
          selectedConversationId: null,
          onSelected: (_) {},
          onLoadMore: () {},
          hasMore: false,
          isLoadingMore: false,
        ),
      ),
    );

    expect(find.text('Mira'), findsOneWidget);
    expect(find.text('Draft the agenda'), findsOneWidget);
    expect(find.text('AI'), findsNothing);
    expect(find.byIcon(LucideIcons.sparkles), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
  });
}
