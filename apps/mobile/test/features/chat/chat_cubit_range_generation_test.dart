import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'chat_cubit_fixture.dart';

const _queuedId = '99999999-9999-4999-8999-999999999999';

ChatMessage _queued() => fixtureMessage(999).copyWith(
  id: _queuedId,
  clientRequestId: '88888888-8888-4888-8888-888888888888',
);

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  tearDown(() => OfflineMutationQueue.instance.pending.value = []);

  late CubitHarness harness;
  setUp(() => harness = CubitHarness());
  tearDown(() => harness.dispose());

  ChatCubit cubitOf() => harness.cubit;
  List<String> ids() =>
      cubitOf().state.selectedMessages.map((message) => message.id).toList();

  test('a queued send in both pages does not fake overlap', () async {
    OfflineMutationQueue.instance.pending.value = [
      PendingMutationRecord(
        id: 'queued-send',
        feature: 'chat',
        method: 'POST',
        path:
            '/api/v1/workspaces/$fixtureWs/chat/conversations/$threadId/messages',
        createdAt: DateTime.utc(2026, 11, 2),
        workspaceId: fixtureWs,
        optimisticPatch: {'entityId': _queuedId},
      ),
    ];
    harness.repository.serverCountOf = (messages) => 60;
    harness.repository.onListMessages = (conversationId, before) async =>
        conversationId == threadId
        ? [...fixtureRange(1, 60), _queued()]
        : const [];
    await harness.open();

    // 200 messages arrive overnight; the send has not replayed yet.
    harness.repository.onListMessages = (conversationId, before) async => [
      ...fixtureRange(141, 200),
      _queued(),
    ];
    await cubitOf().refresh(quietly: true, fresh: true);

    expect(ids(), isNot(contains(messageId(1))));
    expect(ids(), isNot(contains(messageId(60))));
    expect(ids().first, messageId(141));
    expect(ids(), contains(_queuedId));
    expect(cubitOf().state.selectedHasOlderMessages, isTrue);
  });

  test('an id-only overlap without a dated range does not throw', () async {
    final undated = ChatMessage(
      id: messageId(500),
      conversationId: threadId,
      content: 'undated',
      kind: ChatMessageKind.user,
      senderId: 'ada',
    );
    harness.repository.serverCountOf = (messages) => 60;
    harness.repository.onListMessages = (conversationId, before) async =>
        conversationId == threadId ? [undated] : const [];
    await harness.open();

    harness.repository.onListMessages = (conversationId, before) async => [
      undated,
      ...fixtureRange(1, 59),
    ];
    await cubitOf().refresh(quietly: true, fresh: true);

    expect(ids(), contains(messageId(500)));
    expect(ids(), contains(messageId(59)));
  });

  test('an unexpected load failure is reported and refresh recovers', () async {
    harness.repository.onListMessages = (conversationId, before) =>
        Future.error(StateError('bad cache state'));
    await harness.open();
    expect(cubitOf().state.messageStatus, ChatMessageStatus.error);
    expect(cubitOf().state.error, contains('bad cache state'));

    harness.repository.onListMessages = (conversationId, before) async =>
        fixtureRange(1, 3);
    await cubitOf().refresh(fresh: true);
    expect(cubitOf().state.messageStatus, ChatMessageStatus.loaded);
    expect(ids(), hasLength(3));
  });

  test('an older page fetched across a replacing refresh is dropped', () async {
    harness.repository.onListMessages = (conversationId, before) async =>
        conversationId == threadId ? fixtureRange(41, 100) : const [];
    await harness.open();
    final older = Completer<List<ChatMessage>>();
    harness.repository.onListMessages = (conversationId, before) =>
        before == null ? Future.value(fixtureRange(300, 359)) : older.future;

    final load = cubitOf().loadOlderMessages();
    await harness.settle();
    await cubitOf().refresh(quietly: true, fresh: true);
    expect(ids().first, messageId(300));

    older.complete(fixtureRange(1, 40));
    await load;

    expect(ids(), [for (var n = 300; n <= 359; n++) messageId(n)]);
    expect(cubitOf().state.loadingOlderConversationId, isNull);
  });

  test('an older page for a removed conversation is dropped', () async {
    harness.repository.onListMessages = (conversationId, before) async =>
        conversationId == threadId ? fixtureRange(41, 100) : const [];
    await harness.open();
    final older = Completer<List<ChatMessage>>();
    harness.repository.onListMessages = (conversationId, before) =>
        older.future;

    final load = cubitOf().loadOlderMessages();
    await harness.settle();
    harness.inbox.add(const ChatRealtimeConversationDeletedEvent(threadId));
    await harness.settle();
    older.complete(fixtureRange(1, 40));
    await load;

    expect(cubitOf().state.messages[threadId], isNull);
  });

  group('revalidation', () {
    test('a cached selection is revalidated in the background', () async {
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId ? fixtureRange(1, 3) : const [];
      await harness.open();
      await cubitOf().selectConversation(otherThreadId);
      await harness.settle();

      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId ? fixtureRange(1, 4) : const [];
      harness.now = harness.now.add(ChatCubit.revalidateAfter);
      // Re-selecting serves the cached page; the background check fixes it.
      await cubitOf().selectConversation(threadId);
      await harness.settle();

      expect(ids().last, messageId(4));
    });

    test('a recent server fetch is not revalidated again', () async {
      var fetches = 0;
      harness.repository.onListMessages = (conversationId, before) async {
        if (conversationId == threadId) fetches++;
        return conversationId == threadId ? fixtureRange(1, 3) : const [];
      };
      await harness.open();
      final afterOpen = fetches;

      await cubitOf().selectConversation(otherThreadId);
      await cubitOf().selectConversation(threadId);
      await harness.settle();

      expect(fetches, afterOpen);
    });
  });
}
