import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_link_preview_store.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_link_previews.dart';
import 'package:mobile/features/chat/widgets/chat_read_receipt.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';

import '../../helpers/design_render_harness.dart';

const _room = '33333333-3333-4333-8333-333333333333';
const _ada = ChatUserProfile(id: 'ada', displayName: 'Ada Lovelace');
const _me = ChatUserProfile(id: 'me', displayName: 'Minh Tran');
final _sentAt = DateTime(2026, 11, 19, 8, 5);

ChatConversationMember _member(ChatUserProfile user, [DateTime? readAt]) =>
    ChatConversationMember(
      id: 'member-${user.id}',
      conversationId: _room,
      userId: user.id,
      user: user,
      role: 'member',
      lastReadAt: readAt,
    );

final _conversation = ChatConversation(
  id: _room,
  wsId: 'workspace',
  type: ChatConversationType.direct,
  updatedAt: _sentAt,
  members: [
    _member(_me, _sentAt),
    _member(_ada, _sentAt.add(const Duration(minutes: 1))),
  ],
);

final _messages = [
  ChatMessage(
    id: '00000000-0000-4000-8000-000000000101',
    conversationId: _room,
    content: 'The checklist is here: https://docs.example/mobile/release.',
    kind: ChatMessageKind.user,
    senderId: 'ada',
    sender: _ada,
    createdAt: DateTime(2026, 11, 19, 8),
  ),
  ChatMessage(
    id: '00000000-0000-4000-8000-000000000102',
    conversationId: _room,
    content: 'Thanks, starting on it now.',
    kind: ChatMessageKind.user,
    senderId: 'me',
    sender: _me,
    createdAt: _sentAt,
  ),
];

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness.name;
    testWidgets('chat thread previews and receipt $name', (tester) async {
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      final store = ChatLinkPreviewStore(
        fetch: (wsId, conversationId, urls) async => [
          for (final url in urls)
            ChatLinkPreview(
              url: url,
              siteName: 'Tuturuuu Docs',
              title: 'Mobile release checklist',
              description:
                  'Steps to verify, sign and ship a mobile build to the '
                  'stores, with the rollback plan.',
            ),
        ],
      );
      await tester.pumpWidget(
        DesignRenderApp(
          settings: DesignRender.themes[name]!.$1,
          brightness: brightness,
          child: ChatThreadView(
            conversation: _conversation,
            messages: _messages,
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
            isMessageSynced: (_) => true,
            linkPreviews: store,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 50));

      expect(ChatCubit.isServerConversationId(_room), isTrue);
      expect(find.byType(ChatLinkPreviewCard), findsOneWidget);
      expect(find.text('Mobile release checklist'), findsOneWidget);
      expect(find.byType(ChatReadReceipt), findsOneWidget);
      expect(find.text('Seen'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'chat-thread-parity-$name');
    });
  }
}
