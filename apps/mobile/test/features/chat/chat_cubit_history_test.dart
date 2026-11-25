import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'chat_cubit_fixture.dart';

const _thumbs = '\u{1F44D}';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  late CubitHarness harness;
  setUp(() {
    harness = CubitHarness();
    // Newest page: messages 41-100 (full). Older: 1-40 (the start).
    harness.repository.onListMessages = (conversationId, before) async =>
        conversationId != threadId
        ? const []
        : before == null
        ? fixtureRange(41, 100)
        : fixtureRange(1, 40);
  });
  tearDown(() => harness.dispose());

  ChatCubit cubitOf() => harness.cubit;
  List<String> ids() =>
      cubitOf().state.selectedMessages.map((message) => message.id).toList();

  test('loads older history before the oldest loaded message', () async {
    await harness.open();
    expect(cubitOf().state.selectedHasOlderMessages, isTrue);

    await cubitOf().loadOlderMessages();

    expect(
      harness.repository.beforeCursors.last,
      fixtureMessage(41).createdAt!.toUtc().toIso8601String(),
    );
    expect(ids(), [for (var n = 1; n <= 100; n++) messageId(n)]);
    expect(cubitOf().state.selectedHasOlderMessages, isFalse);
    expect(cubitOf().state.loadingOlderConversationId, isNull);
  });

  test('a stale history page is dropped and the spinner clears', () async {
    await harness.open();
    final page = Completer<List<ChatMessage>>();
    harness.repository.onListMessages = (conversationId, before) =>
        before == null ? Future.value(fixtureRange(41, 100)) : page.future;

    final load = cubitOf().loadOlderMessages();
    expect(cubitOf().state.isLoadingOlderMessages, isTrue);
    await cubitOf().refresh();
    page.complete(fixtureRange(1, 40));
    await load;

    expect(ids().first, messageId(41));
    expect(cubitOf().state.loadingOlderConversationId, isNull);
  });

  test('an unexpected history failure clears the spinner', () async {
    await harness.open();
    harness.repository.onListMessages = (conversationId, before) =>
        Future.error(StateError('socket closed'));

    await cubitOf().loadOlderMessages();

    expect(cubitOf().state.loadingOlderConversationId, isNull);
    expect(cubitOf().state.error, contains('socket closed'));
  });

  test('history loading in one thread does not show in another', () async {
    await harness.open();
    final page = Completer<List<ChatMessage>>();
    harness.repository.onListMessages = (conversationId, before) =>
        before == null ? Future.value(const []) : page.future;

    final load = cubitOf().loadOlderMessages();
    await cubitOf().selectConversation(otherThreadId);
    expect(cubitOf().state.isLoadingOlderMessages, isFalse);
    page.complete(const []);
    await load;
  });

  test('a quiet refresh keeps older pages and the reply target', () async {
    await harness.open();
    await cubitOf().loadOlderMessages();
    cubitOf().startReply(fixtureMessage(5));
    // The newest 60 now skip message 50 (deleted elsewhere) and add 101.
    harness.repository.onListMessages = (conversationId, before) async => [
      ...fixtureRange(41, 49),
      ...fixtureRange(51, 101),
    ];

    await cubitOf().refresh(quietly: true, fresh: true);

    expect(ids().first, messageId(1));
    expect(ids().last, messageId(101));
    expect(ids(), isNot(contains(messageId(50))));
    expect(ids(), hasLength(100));
    expect(cubitOf().state.selectedHasOlderMessages, isFalse);
    expect(cubitOf().state.replyToMessage?.id, messageId(5));
  });

  test('a refresh that loses the reply target clears the reply', () async {
    await harness.open();
    cubitOf().startReply(fixtureMessage(60));
    harness.repository.onListMessages = (conversationId, before) async =>
        fixtureRange(70, 80);

    await cubitOf().refresh(quietly: true, fresh: true);

    expect(cubitOf().state.replyToMessageId, isNull);
  });

  test('queued sends do not fill a history page', () async {
    // 59 synced messages plus one queued send: the server page was short.
    OfflineMutationQueue.instance.pending.value = [
      PendingMutationRecord(
        id: 'queued-send',
        feature: 'chat',
        method: 'POST',
        path:
            '/api/v1/workspaces/$fixtureWs/chat/conversations/$threadId/messages',
        createdAt: DateTime.utc(2026, 11, 2),
        workspaceId: fixtureWs,
        optimisticPatch: {'entityId': messageId(999)},
      ),
    ];
    addTearDown(() => OfflineMutationQueue.instance.pending.value = []);
    // The server returned 59 rows; the repository overlaid the queued send.
    harness.repository.onListMessages = (conversationId, before) async => [
      ...fixtureRange(1, 59),
      fixtureMessage(999),
    ];
    harness.repository.serverCountOf = (messages) => 59;
    await harness.open();
    expect(cubitOf().state.selectedMessages, hasLength(60));
    expect(cubitOf().state.selectedHasOlderMessages, isFalse);
    expect(cubitOf().isMessageSynced(messageId(999)), isFalse);
    expect(cubitOf().isMessageSynced(messageId(59)), isTrue);
  });

  test('a queued delete does not make a full page look short', () async {
    // The server returned 60 rows; a queued delete removed one locally.
    harness.repository.onListMessages = (conversationId, before) async => [
      ...fixtureRange(41, 69),
      ...fixtureRange(71, 100),
    ];
    harness.repository.serverCountOf = (messages) => 60;
    await harness.open();
    expect(cubitOf().state.selectedMessages, hasLength(59));
    expect(cubitOf().state.selectedHasOlderMessages, isTrue);
  });

  group('realtime', () {
    test('a reaction on an unloaded message is not appended', () async {
      await harness.open();
      final before = cubitOf().state.conversations;
      harness.inbox.add(
        ChatRealtimeMessageEvent(
          type: 'reaction.updated',
          message: fixtureMessage(
            3,
            reactions: const [
              ChatReactionSummary(emoji: _thumbs, count: 1, userIds: ['ada']),
            ],
          ),
        ),
      );
      await harness.settle();

      expect(ids(), isNot(contains(messageId(3))));
      expect(ids().first, messageId(41));
      expect(cubitOf().state.conversations, before);
    });

    test('a reaction echo patches without reordering the list', () async {
      await harness.open();
      final order = cubitOf().state.conversations.map((c) => c.id).toList();
      final latest = cubitOf().state.selectedConversation?.latestMessage;
      harness.inbox.add(
        ChatRealtimeMessageEvent(
          type: 'reaction.updated',
          message: fixtureMessage(
            50,
            reactions: const [
              ChatReactionSummary(emoji: _thumbs, count: 1, userIds: ['ada']),
            ],
          ),
        ),
      );
      await harness.settle();

      final patched = cubitOf().state.selectedMessages.firstWhere(
        (message) => message.id == messageId(50),
      );
      expect(patched.reactions.single.emoji, _thumbs);
      expect(cubitOf().state.conversations.map((c) => c.id), order);
      expect(cubitOf().state.selectedConversation?.latestMessage, latest);
    });

    test('an edit keeps reactions it does not carry', () async {
      harness.repository.onListMessages = (conversationId, before) async => [
        fixtureMessage(
          1,
          reactions: const [
            ChatReactionSummary(emoji: _thumbs, count: 2, userIds: ['ada']),
          ],
        ),
      ];
      await harness.open();
      harness.inbox.add(
        ChatRealtimeMessageEvent(
          type: 'message.updated',
          message: fixtureMessage(
            1,
          ).copyWith(content: 'edited', editedAt: DateTime.utc(2026, 11, 2)),
        ),
      );
      await harness.settle();

      final message = cubitOf().state.selectedMessages.single;
      expect(message.content, 'edited');
      expect(message.reactions.single.count, 2);
    });

    test('a new message still appends', () async {
      await harness.open();
      harness.inbox.add(
        ChatRealtimeMessageEvent(
          type: 'message.created',
          message: fixtureMessage(101),
        ),
      );
      await harness.settle();
      expect(ids().last, messageId(101));
    });
  });

  test('ApiException is the reported failure for history', () async {
    await harness.open();
    harness.repository.onListMessages = (conversationId, before) =>
        Future.error(const ApiException(message: 'offline', statusCode: 0));
    await cubitOf().loadOlderMessages();
    expect(cubitOf().state.error, 'offline');
  });
}
