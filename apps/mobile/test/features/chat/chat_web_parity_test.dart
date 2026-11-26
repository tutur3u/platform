import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_link_preview_store.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_link_previews.dart';
import 'package:mobile/features/chat/widgets/chat_read_receipt.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/pump_app.dart';
import 'chat_cubit_fixture.dart';

const _me = ChatUserProfile(id: 'me', displayName: 'Minh Tran');
const _ada = ChatUserProfile(id: 'ada', displayName: 'Ada Lovelace');
const _linh = ChatUserProfile(id: 'linh', displayName: 'Linh Pham');

ChatConversationMember _member(ChatUserProfile user, [DateTime? readAt]) =>
    ChatConversationMember(
      id: 'm-${user.id}',
      conversationId: threadId,
      userId: user.id,
      user: user,
      role: 'member',
      lastReadAt: readAt,
    );

ChatConversation _conversation(
  ChatConversationType type,
  List<ChatConversationMember> members,
) => ChatConversation(
  id: threadId,
  wsId: fixtureWs,
  type: type,
  updatedAt: fixtureStart,
  members: members,
);

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  group('read receipts', () {
    late CubitHarness harness;
    setUp(() => harness = CubitHarness());
    tearDown(() => harness.dispose());

    DateTime? readAtOf(String userId) => harness.cubit.state.conversations
        .firstWhere((conversation) => conversation.id == threadId)
        .members
        .firstWhere((member) => member.userId == userId)
        .lastReadAt;

    test('read.updated moves a member cursor forward only', () async {
      final start = fixtureStart.add(const Duration(minutes: 1));
      harness.repository.conversations = [
        _conversation(ChatConversationType.direct, [
          _member(_me),
          _member(_ada, start),
        ]),
      ];
      await harness.open();
      final later = start.add(const Duration(minutes: 5));

      harness.inbox.add(
        ChatRealtimeReadEvent(
          conversationId: threadId,
          userId: 'ada',
          lastReadAt: later,
        ),
      );
      await harness.settle();
      expect(readAtOf('ada'), later);

      harness.inbox.add(
        ChatRealtimeReadEvent(
          conversationId: threadId,
          userId: 'ada',
          lastReadAt: start,
        ),
      );
      await harness.settle();
      expect(readAtOf('ada'), later);
    });

    ChatMessage sent(int n, {String sender = 'me'}) =>
        fixtureMessage(n, sender: sender);

    test('a direct reader of the newest own message is seen', () {
      final messages = [sent(1, sender: 'ada'), sent(2)];
      final receipt = chatSeenReceipt(
        _conversation(ChatConversationType.direct, [
          _member(_me),
          _member(_ada, messages.last.createdAt),
        ]),
        messages,
        currentUserId: 'me',
        isSynced: (_) => true,
      );
      expect(receipt?.messageId, messageId(2));
      expect(receipt?.readers, [_ada]);
    });

    test('only members at or past the message count as readers', () {
      final messages = [sent(1), sent(2)];
      final at = messages.last.createdAt!;
      final receipt = chatSeenReceipt(
        _conversation(ChatConversationType.channel, [
          _member(_me),
          _member(_ada, at.add(const Duration(seconds: 1))),
          _member(_linh, at.subtract(const Duration(seconds: 1))),
        ]),
        messages,
        currentUserId: 'me',
        isSynced: (_) => true,
      );
      expect(receipt?.readers, [_ada]);
    });

    test('no receipt for replies, pending sends, or Mira', () {
      final readAll = [_member(_me), _member(_ada, DateTime.utc(2030))];
      final replied = [sent(1), sent(2, sender: 'ada')];
      expect(
        chatSeenReceipt(
          _conversation(ChatConversationType.direct, readAll),
          replied,
          currentUserId: 'me',
          isSynced: (_) => true,
        ),
        isNull,
      );
      expect(
        chatSeenReceipt(
          _conversation(ChatConversationType.direct, readAll),
          [sent(1)],
          currentUserId: 'me',
          isSynced: (_) => false,
        ),
        isNull,
      );
      expect(
        chatSeenReceipt(
          _conversation(ChatConversationType.ai, readAll),
          [sent(1)],
          currentUserId: 'me',
          isSynced: (_) => true,
        ),
        isNull,
      );
    });

    testWidgets('direct shows Seen; groups count readers', (tester) async {
      await tester.pumpApp(
        const Column(
          children: [
            ChatReadReceipt(readers: [_ada], direct: true),
            ChatReadReceipt(readers: [_ada, _linh], direct: false),
          ],
        ),
      );
      expect(find.text('Seen'), findsOneWidget);
      expect(find.text('Seen by 2'), findsOneWidget);
      expect(
        find.bySemanticsLabel('Seen by Ada Lovelace, Linh Pham'),
        findsOneWidget,
      );
    });
  });

  group('link previews', () {
    test('links are cleaned, deduplicated and capped like web', () {
      expect(
        extractChatLinks(
          'See https://a.example/x, (https://b.example/y) and '
          'https://a.example/x. ftp://c.example javascript:alert(1) '
          'https://c.example https://d.example https://e.example '
          'https://f.example',
        ),
        [
          'https://a.example/x',
          'https://b.example/y',
          'https://c.example',
          'https://d.example',
          'https://e.example',
        ],
      );
    });

    test('the store caches, shares requests and backs off failures', () async {
      var now = DateTime.utc(2026, 11, 26, 9);
      final calls = <List<String>>[];
      var fail = false;
      final gate = Completer<void>();
      final store = ChatLinkPreviewStore(
        now: () => now,
        fetch: (wsId, conversationId, urls) async {
          calls.add(urls);
          await gate.future;
          if (fail) throw StateError('offline');
          return [ChatLinkPreview(url: urls.single, title: 'Example')];
        },
      );
      const urls = ['https://a.example'];

      final first = store.load('ws', 'c', urls);
      final second = store.load('ws', 'c', urls);
      gate.complete();
      expect((await first).single.title, 'Example');
      expect(await second, await first);
      expect(calls, hasLength(1));
      expect(store.cached('ws', 'c', urls)?.single.title, 'Example');
      expect(store.cached('other-ws', 'c', urls), isNull);

      now = now.add(store.ttl);
      fail = true;
      expect(store.cached('ws', 'c', urls), isNull);
      expect(await store.load('ws', 'c', urls), isEmpty);
      expect(await store.load('ws', 'c', urls), isEmpty);
      expect(calls, hasLength(2));

      now = now.add(store.retryAfter);
      fail = false;
      expect(await store.load('ws', 'c', urls), hasLength(1));
      expect(calls, hasLength(3));
    });

    testWidgets('only previews with text get a card', (tester) async {
      final store = ChatLinkPreviewStore(
        fetch: (wsId, conversationId, urls) async => const [
          ChatLinkPreview(
            url: 'https://docs.example/guide',
            title: 'Release guide',
            description: 'How the team ships the mobile app.',
            siteName: 'Docs',
            imageUrl: 'https://docs.example/cover.png',
          ),
          ChatLinkPreview(url: 'https://empty.example', error: 'blocked'),
        ],
      );
      await tester.pumpApp(
        ChatLinkPreviews(
          store: store,
          wsId: fixtureWs,
          conversationId: threadId,
          content: 'Read https://docs.example/guide and https://empty.example',
        ),
      );
      await tester.pump();

      expect(find.byType(ChatLinkPreviewCard), findsOneWidget);
      expect(find.text('Release guide'), findsOneWidget);
      expect(find.text('Docs'), findsOneWidget);
      expect(find.byType(Image), findsNothing);
    });
  });

  group('message search', () {
    late CubitHarness harness;
    setUp(() => harness = CubitHarness());
    tearDown(() => harness.dispose());

    test('waits for two characters, like web', () async {
      await harness.open();

      await harness.cubit.searchMessages(' a ');
      verifyNever(
        () => harness.api.getJson(any(that: contains('/chat/search'))),
      );

      await harness.cubit.searchMessages('ab');
      verify(
        () => harness.api.getJson(any(that: contains('/chat/search'))),
      ).called(1);
    });
  });
}
