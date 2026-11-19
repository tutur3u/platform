import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_conversation_list.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';

import '../../helpers/design_render_harness.dart';

const _ada = ChatUserProfile(id: 'ada', displayName: 'Ada Lovelace');

final _conversations = [
  ChatConversation(
    id: 'ai',
    wsId: 'workspace',
    type: ChatConversationType.ai,
    updatedAt: DateTime(2026, 11, 19, 9),
    title: 'Mira',
    unreadCount: 2,
    latestMessage: ChatMessage(
      id: 'ai-message',
      conversationId: 'ai',
      content: 'Draft the agenda',
      kind: ChatMessageKind.assistant,
      createdAt: DateTime(2026, 11, 19, 9),
    ),
  ),
  ChatConversation(
    id: 'direct',
    wsId: 'workspace',
    type: ChatConversationType.direct,
    updatedAt: DateTime(2026, 11, 19, 8),
    members: [
      ChatConversationMember(
        id: 'member',
        conversationId: 'direct',
        userId: 'ada',
        user: _ada,
        role: 'member',
        pinnedAt: DateTime(2026, 11, 19),
      ),
    ],
    latestMessage: ChatMessage(
      id: 'direct-message',
      conversationId: 'direct',
      content: 'Can you review the notes?',
      kind: ChatMessageKind.user,
      createdAt: DateTime(2026, 11, 19, 8),
    ),
  ),
  ChatConversation(
    id: 'group',
    wsId: 'workspace',
    type: ChatConversationType.group,
    updatedAt: DateTime(2026, 11, 2),
    title: 'Design',
    latestMessage: ChatMessage(
      id: 'group-message',
      conversationId: 'group',
      content: 'See you at 4',
      kind: ChatMessageKind.user,
      createdAt: DateTime(2026, 11, 2, 16),
    ),
  ),
];

Future<void> _pump(
  WidgetTester tester, {
  required Widget page,
  required Brightness brightness,
}) async {
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
  final settings = brightness == Brightness.dark
      ? DesignRender.themes['dark']!.$1
      : DesignRender.themes['light']!.$1;
  await tester.pumpWidget(
    DesignRenderApp(settings: settings, brightness: brightness, child: page),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness.name;
    testWidgets('chat list $name', (tester) async {
      await _pump(
        tester,
        brightness: brightness,
        page: ChatConversationList(
          conversations: _conversations,
          selectedConversationId: null,
          currentUserId: 'me',
          onSelected: (_) {},
          onLoadMore: () {},
          hasMore: false,
          isLoadingMore: false,
          onArchive: (_) async {},
          onDelete: (_) async {},
        ),
      );
      expect(find.text('Mira'), findsOneWidget);
      expect(find.text('Draft the agenda'), findsOneWidget);
      expect(find.text('AI'), findsNothing);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'chat-list-$name');
    });

    testWidgets('chat thread $name', (tester) async {
      await _pump(
        tester,
        brightness: brightness,
        page: ChatThreadView(
          conversation: _conversations[1],
          messages: [
            ChatMessage(
              id: 'incoming',
              conversationId: 'direct',
              content: 'Can you review the **notes**?',
              kind: ChatMessageKind.user,
              senderId: 'ada',
              sender: _ada,
              createdAt: DateTime(2026, 11, 19, 8),
            ),
            ChatMessage(
              id: 'outgoing',
              conversationId: 'direct',
              content: 'Yes — sending them now.',
              kind: ChatMessageKind.user,
              senderId: 'me',
              createdAt: DateTime(2026, 11, 19, 8, 5),
            ),
          ],
          messageStatus: ChatMessageStatus.loaded,
          currentUserId: 'me',
          pendingAttachments: const [],
          streamingAssistantText: '',
          isSending: false,
          isUploadingAttachment: false,
          onSend: (_) {},
          onPickAttachment: (_) async {},
          onRemoveAttachment: (_) {},
          onReaction: (_, _) {},
        ),
      );
      expect(find.textContaining('notes'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'chat-thread-$name');
    });
  }
}
