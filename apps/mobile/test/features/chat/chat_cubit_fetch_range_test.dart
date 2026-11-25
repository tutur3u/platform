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
const _localId = '99999999-9999-4999-8999-999999999999';

void _queueLocalSend() {
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
}

ChatMessage _local() => fixtureMessage(4).copyWith(
  id: _localId,
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

  test(
    'an appended row does not make a skipped page look contiguous',
    () async {
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId ? fixtureRange(1, 60) : const [];
      await harness.open();

      // Realtime was down while 61-160 arrived; then 161 lands live.
      harness.inbox.add(
        ChatRealtimeMessageEvent(
          type: 'message.created',
          message: fixtureMessage(161),
        ),
      );
      await harness.settle();
      expect(ids().last, messageId(161));

      harness.repository.onListMessages = (conversationId, before) async =>
          fixtureRange(102, 161);
      await cubitOf().refresh(quietly: true, fresh: true);

      expect(ids(), [for (var n = 102; n <= 161; n++) messageId(n)]);
      expect(cubitOf().state.selectedHasOlderMessages, isTrue);
      harness.repository.onListMessages = (conversationId, before) async =>
          fixtureRange(42, 101);
      await cubitOf().loadOlderMessages();
      expect(
        harness.repository.beforeCursors.last,
        fixtureMessage(102).createdAt!.toUtc().toIso8601String(),
      );
      expect(ids().first, messageId(42));
    },
  );

  test('a realtime message during the first load is kept', () async {
    final page = Completer<List<ChatMessage>>();
    harness.repository.onListMessages = (conversationId, before) =>
        conversationId == threadId ? page.future : Future.value(const []);

    final open = harness.open();
    await harness.settle();
    harness.inbox.add(
      ChatRealtimeMessageEvent(
        type: 'message.created',
        message: fixtureMessage(61),
      ),
    );
    await harness.settle();
    page.complete(fixtureRange(1, 60));
    await open;

    expect(ids().last, messageId(61));
    expect(ids(), hasLength(61));
  });

  test('a fetch keeps an in-flight reaction tap', () async {
    harness.repository.onListMessages = (conversationId, before) async =>
        conversationId == threadId ? [fixtureMessage(1)] : const [];
    await harness.open();
    final reply = Completer<ChatMessage>();
    harness.repository.onSetReaction = (id, present, opId) => reply.future;

    final tap = cubitOf().toggleReaction(
      cubitOf().state.selectedMessages.single,
      _thumbs,
    );
    await harness.settle();
    await cubitOf().refresh(quietly: true, fresh: true);

    expect(cubitOf().state.selectedMessages.single.reactions.single.userIds, [
      'me',
    ]);
    reply.complete(fixtureMessage(1));
    await tap;
  });

  group('queued sends', () {
    setUp(() {
      _queueLocalSend();
      harness.repository.onListMessages = (conversationId, before) async =>
          conversationId == threadId
          ? [...fixtureRange(1, 3), _local()]
          : const [];
    });

    test('a rejected send is pruned when its row is dropped', () async {
      await harness.open();
      expect(cubitOf().isMessageSynced(_localId), isFalse);

      // The queue gave up on the send; the server never stored it.
      harness.repository.onListMessages = (conversationId, before) async =>
          fixtureRange(1, 3);
      OfflineMutationQueue.instance.pending.value = [];
      await harness.settle();

      expect(ids(), isNot(contains(_localId)));
      expect(cubitOf().isMessageSynced(_localId), isTrue);
    });

    test('a failing refetch after a replay stays contained', () async {
      await harness.open();
      harness.repository.onListMessages = (conversationId, before) =>
          Future.error(StateError('Response invalidated during refresh.'));

      OfflineMutationQueue.instance.pending.value = [];
      await harness.settle();

      expect(ids(), contains(_localId));
    });
  });
}
