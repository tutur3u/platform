import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_conversation_list.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';
import 'chat_cubit_fixture.dart';

const _blocksPath = '/api/v1/workspaces/$fixtureWs/chat/blocks';

const List<ChatBlockedUser> _adaBlocked = [ChatBlockedUser(userId: 'ada')];

Map<String, dynamic> _adaBlocks() => {
  'blocks': [
    {
      'userId': 'ada',
      'displayName': 'Ada',
      'createdAt': '2026-11-20T09:00:00Z',
    },
  ],
};

ChatConversation _shared(String id, ChatConversationType type, String sender) =>
    ChatConversation(
      id: id,
      wsId: fixtureWs,
      type: type,
      title: id,
      updatedAt: fixtureStart,
      latestMessage: ChatMessage(
        id: 'latest-$id',
        conversationId: id,
        content: 'secret from $sender',
        kind: ChatMessageKind.user,
        senderId: sender,
        sender: ChatUserProfile(id: sender, displayName: sender),
        createdAt: fixtureStart,
      ),
    );

void main() {
  group('conversation previews', () {
    final state = ChatState(
      scope: ChatScope.personal,
      conversations: [
        _shared('group-ada', ChatConversationType.group, 'ada'),
        _shared('group-grace', ChatConversationType.group, 'grace'),
      ],
      blockedUsers: _adaBlocked,
    );

    test('a blocked sender latest message is left out', () {
      final byId = {
        for (final conversation in state.visibleConversations)
          conversation.id: conversation,
      };
      expect(byId['group-ada']!.latestMessage, isNull);
      expect(byId['group-grace']!.latestMessage?.senderId, 'grace');

      final channels = state.copyWith(
        scope: ChatScope.workspaces,
        conversations: [
          _shared('channel-ada', ChatConversationType.channel, 'ada'),
        ],
      );
      expect(channels.visibleConversations.single.latestMessage, isNull);
    });

    testWidgets('the list shows no preview text for it', (tester) async {
      await tester.pumpApp(
        SizedBox(
          height: 320,
          child: ChatConversationList(
            conversations: state.visibleConversations,
            selectedConversationId: null,
            onSelected: (_) {},
            onLoadMore: () {},
            hasMore: false,
            isLoadingMore: false,
          ),
        ),
      );

      expect(find.textContaining('secret from ada'), findsNothing);
      expect(find.text('No messages yet'), findsOneWidget);
      expect(find.textContaining('secret from grace'), findsOneWidget);
    });
  });

  test('typing indicator leaves out blocked people', () {
    const state = ChatState(
      typingUserIds: {'ada', 'grace'},
      blockedUsers: _adaBlocked,
    );
    expect(state.visibleTypingUserIds, {'grace'});
  });

  test('reply target from a blocked sender is not offered', () {
    final state = ChatState(
      selectedConversationId: threadId,
      messages: {
        threadId: [fixtureMessage(1)],
      },
      replyToMessageId: messageId(1),
      blockedUsers: _adaBlocked,
    );
    expect(state.replyToMessage, isNull);
  });

  group('cubit', () {
    setUp(() => FlutterSecureStorage.setMockInitialValues({}));

    late CubitHarness harness;
    setUp(() {
      harness = CubitHarness();
      harness.repository.onListMessages = (_, _) async => [
        fixtureMessage(1),
        fixtureMessage(2, sender: 'me'),
        fixtureMessage(3, sender: 'grace'),
      ];
    });
    tearDown(() => harness.dispose());

    test('a realtime message that lands before blocks load is hidden once '
        'they do', () async {
      final blocks = Completer<Map<String, dynamic>>();
      when(
        () => harness.api.getJson(_blocksPath),
      ).thenAnswer((_) => blocks.future);
      await harness.open();

      harness.inbox.add(
        ChatRealtimeMessageEvent(
          type: 'message.created',
          message: fixtureMessage(4),
        ),
      );
      await harness.settle();
      expect(
        harness.cubit.state.visibleSelectedMessages.map((m) => m.id),
        contains(messageId(4)),
      );

      blocks.complete(_adaBlocks());
      await harness.settle();

      final state = harness.cubit.state;
      expect(state.visibleSelectedMessages.map((m) => m.senderId), [
        'me',
        'grace',
      ]);
      final thread = state.visibleConversations.firstWhere(
        (conversation) => conversation.id == threadId,
      );
      expect(thread.latestMessage, isNull);
    });

    test('edits to a blocked sender message are skipped and blocked '
        'reactions are stripped', () async {
      when(
        () => harness.api.getJson(_blocksPath),
      ).thenAnswer((_) async => _adaBlocks());
      await harness.open();

      harness.inbox
        ..add(
          ChatRealtimeMessageEvent(
            type: 'message.updated',
            message: fixtureMessage(1).copyWith(content: 'edited by ada'),
          ),
        )
        ..add(
          ChatRealtimeMessageEvent(
            type: 'reaction.updated',
            message: fixtureMessage(
              3,
              sender: 'grace',
              reactions: const [
                ChatReactionSummary(
                  emoji: 'like',
                  count: 2,
                  userIds: ['ada', 'me'],
                ),
                ChatReactionSummary(emoji: 'party', count: 1, userIds: ['ada']),
              ],
            ),
          ),
        );
      await harness.settle();

      final state = harness.cubit.state;
      expect(
        state.selectedMessages.firstWhere((m) => m.id == messageId(1)).content,
        'message 1',
      );
      final grace = state.visibleSelectedMessages.firstWhere(
        (m) => m.id == messageId(3),
      );
      expect(grace.reactions, const [
        ChatReactionSummary(emoji: 'like', count: 1, userIds: ['me']),
      ]);
    });
  });
}
