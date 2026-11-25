import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'chat_cubit_fixture.dart';

const _thumbs = '\u{1F44D}';
const _party = '\u{1F389}';
const _localId = '99999999-9999-4999-8999-999999999999';
const _requestId = '88888888-8888-4888-8888-888888888888';

ChatMessage _local() => ChatMessage(
  id: _localId,
  conversationId: threadId,
  content: 'queued hello',
  kind: ChatMessageKind.user,
  senderId: 'me',
  clientRequestId: _requestId,
  createdAt: fixtureStart.add(const Duration(minutes: 200)),
);

ChatMessage _server() => _local().copyWith(id: messageId(777));

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  tearDown(() => OfflineMutationQueue.instance.pending.value = []);

  late CubitHarness harness;
  setUp(() => harness = CubitHarness());
  tearDown(() => harness.dispose());

  ChatCubit cubitOf() => harness.cubit;
  List<String> ids() =>
      cubitOf().state.selectedMessages.map((message) => message.id).toList();

  group('quiet refresh', () {
    test('a page that does not overlap replaces the thread', () async {
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId ? fixtureRange(1, 60) : const [];
      await harness.open();
      expect(cubitOf().state.selectedHasOlderMessages, isTrue);

      // The app slept; 140 more arrived and the refresh sees 141-200.
      harness.repository.onListMessages = (conversationId, before) async =>
          fixtureRange(141, 200);
      await cubitOf().refresh(quietly: true, fresh: true);

      expect(ids(), [for (var n = 141; n <= 200; n++) messageId(n)]);
      expect(cubitOf().state.selectedHasOlderMessages, isTrue);
      harness.repository.onListMessages = (conversationId, before) async =>
          const [];
      await cubitOf().loadOlderMessages();
      expect(
        harness.repository.beforeCursors.last,
        fixtureMessage(141).createdAt!.toUtc().toIso8601String(),
      );
    });

    test('a message that arrives during the fetch is kept', () async {
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId ? fixtureRange(41, 100) : const [];
      await harness.open();
      final page = Completer<List<ChatMessage>>();
      harness.repository.onListMessages = (conversationId, before) =>
          page.future;

      final refresh = cubitOf().refresh(quietly: true, fresh: true);
      await harness.settle();
      harness.inbox.add(
        ChatRealtimeMessageEvent(
          type: 'message.created',
          message: fixtureMessage(102),
        ),
      );
      await harness.settle();
      page.complete(fixtureRange(42, 101));
      await refresh;

      expect(ids().first, messageId(41));
      expect(ids().last, messageId(102));
      expect(ids(), contains(messageId(101)));
    });

    test('a loaded message at the page start is not dropped', () async {
      final tie = fixtureMessage(
        500,
      ).copyWith(createdAt: fixtureMessage(42).createdAt);
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId
          ? [...fixtureRange(41, 100), tie]
          : const [];
      await harness.open();
      harness.repository.onListMessages = (conversationId, before) async =>
          fixtureRange(42, 101);

      await cubitOf().refresh(quietly: true, fresh: true);

      expect(ids(), containsAll([messageId(41), messageId(500)]));
    });
  });

  test('the details sheet can own a close failure without a toast', () async {
    await harness.open();
    harness.repository.deleteConversationFailure = 'denied';

    final failure = await cubitOf().deleteConversation(
      harness.repository.conversations.first,
      reportError: false,
    );

    expect(failure, 'denied');
    expect(cubitOf().state.error, isNull);
  });

  group('queued sends', () {
    setUp(() {
      OfflineMutationQueue.instance.pending.value = [
        PendingMutationRecord(
          id: 'queued-send',
          feature: 'chat',
          method: 'POST',
          path:
              '/api/v1/workspaces/$fixtureWs/chat/conversations/$threadId/messages',
          createdAt: DateTime.utc(2026, 11, 2),
          workspaceId: fixtureWs,
          optimisticPatch: {'entityId': _localId},
        ),
      ];
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId
          ? [...fixtureRange(1, 3), _local()]
          : const [];
    });

    test('a replayed send swaps its local row for the server copy', () async {
      await harness.open();
      expect(cubitOf().isMessageSynced(_localId), isFalse);
      cubitOf().startReply(_local());
      expect(cubitOf().state.replyToMessageId, isNull);

      harness.repository.onListMessages = (conversationId, before) async => [
        ...fixtureRange(1, 3),
        _server(),
      ];
      OfflineMutationQueue.instance.pending.value = [];
      await harness.settle();

      expect(ids(), isNot(contains(_localId)));
      expect(ids().last, messageId(777));
      expect(cubitOf().isMessageSynced(messageId(777)), isTrue);

      cubitOf().startReply(_server());
      await cubitOf().sendMessage('thanks');
      await harness.settle();
      expect(harness.repository.sentReplyIds, [messageId(777)]);
    });

    test('a realtime server copy replaces the local row', () async {
      await harness.open();
      OfflineMutationQueue.instance.pending.value = [];
      harness.inbox.add(
        ChatRealtimeMessageEvent(type: 'message.created', message: _server()),
      );
      await harness.settle();

      expect(ids().where((id) => id == _localId || id == messageId(777)), [
        messageId(777),
      ]);
    });
  });

  group('reactions', () {
    setUp(() {
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId ? [fixtureMessage(1)] : const [];
    });

    ChatMessage loaded() => cubitOf().state.selectedMessages.single;
    Set<String> mine() => {
      for (final reaction in loaded().reactions)
        if (reaction.userIds.contains('me')) reaction.emoji,
    };

    test('one emoji reply keeps another emoji in flight', () async {
      await harness.open();
      final replies = <String, Completer<ChatMessage>>{};
      harness.repository.onSetReaction = (id, present, opId) {
        final reply = Completer<ChatMessage>();
        replies[opId] = reply;
        return reply.future;
      };

      final thumbs = cubitOf().toggleReaction(loaded(), _thumbs);
      await harness.settle();
      final party = cubitOf().toggleReaction(loaded(), _party);
      await harness.settle();
      expect(mine(), {_thumbs, _party});

      // The thumbs reply predates the party tap and does not include it.
      replies[harness.repository.reactionCalls.first.opId]!.complete(
        fixtureMessage(
          1,
          reactions: const [
            ChatReactionSummary(emoji: _thumbs, count: 1, userIds: ['me']),
          ],
        ),
      );
      await thumbs;
      expect(mine(), {_thumbs, _party});

      replies[harness.repository.reactionCalls.last.opId]!.complete(
        fixtureMessage(
          1,
          reactions: const [
            ChatReactionSummary(emoji: _thumbs, count: 1, userIds: ['me']),
            ChatReactionSummary(emoji: _party, count: 1, userIds: ['me']),
          ],
        ),
      );
      await party;
      expect(mine(), {_thumbs, _party});
    });

    test('an unexpected failure rolls back and reports', () async {
      await harness.open();
      harness.repository.onSetReaction = (id, present, opId) =>
          Future.error(StateError('socket closed'));

      await cubitOf().toggleReaction(loaded(), _thumbs);

      expect(mine(), isEmpty);
      expect(cubitOf().state.error, contains('socket closed'));
    });
  });
}
