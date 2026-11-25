import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

import 'chat_cubit_fixture.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  late CubitHarness harness;
  late int threadFetches;
  setUp(() {
    harness = CubitHarness();
    threadFetches = 0;
  });
  tearDown(() => harness.dispose());

  ChatCubit cubitOf() => harness.cubit;
  List<String> ids() =>
      cubitOf().state.selectedMessages.map((message) => message.id).toList();

  void serve(List<ChatMessage> Function() rows) {
    harness.repository.onListMessages = (conversationId, before) async {
      if (conversationId != threadId) return const [];
      threadFetches++;
      return before == null ? rows() : const [];
    };
  }

  test('a first message during an empty revalidation is kept', () async {
    // A new direct message: nothing on the server yet.
    serve(() => const []);
    await harness.open();
    await cubitOf().selectConversation(otherThreadId);
    harness.now = harness.now.add(ChatCubit.revalidateAfter);

    final page = Completer<List<ChatMessage>>();
    harness.repository.onListMessages = (conversationId, before) =>
        conversationId == threadId ? page.future : Future.value(const []);
    // Re-selecting serves the cached empty page and revalidates it.
    await cubitOf().selectConversation(threadId);
    await harness.settle();
    harness.inbox.add(
      ChatRealtimeMessageEvent(
        type: 'message.created',
        message: fixtureMessage(1),
      ),
    );
    await harness.settle();
    page.complete(const []);
    await harness.settle();

    expect(ids(), [messageId(1)]);
  });

  test('pull to refresh merges and keeps older history', () async {
    serve(() => fixtureRange(41, 100));
    await harness.open();
    harness.repository.onListMessages = (conversationId, before) async =>
        before == null ? fixtureRange(42, 101) : fixtureRange(1, 40);
    await cubitOf().loadOlderMessages();

    await cubitOf().refresh(quietly: true, fresh: true, reportFailure: true);

    expect(ids().first, messageId(1));
    expect(ids().last, messageId(101));
    expect(cubitOf().state.messageStatus, ChatMessageStatus.loaded);
  });

  test('a failed pull to refresh is reported, quietly', () async {
    serve(() => fixtureRange(1, 3));
    await harness.open();
    harness.repository.conversationsFailure = StateError('offline');

    await cubitOf().refresh(quietly: true, fresh: true, reportFailure: true);

    expect(cubitOf().state.error, isNotNull);
    expect(cubitOf().state.status, ChatStatus.loaded);
    expect(ids(), hasLength(3));
  });

  test('a first open from the network is not fetched twice', () async {
    serve(() => fixtureRange(1, 3));
    await harness.open();
    expect(threadFetches, 1);
  });

  test('a fresh read that fell back to the cache arms no throttle', () async {
    serve(() => fixtureRange(1, 3));
    await harness.open();
    harness.now = harness.now.add(ChatCubit.revalidateAfter);

    harness.repository.fallBackToCache = true;
    await cubitOf().refresh(quietly: true, fresh: true);
    final afterFallback = threadFetches;
    harness.repository.fallBackToCache = false;

    await cubitOf().selectConversation(otherThreadId);
    await cubitOf().selectConversation(threadId);
    await harness.settle();

    // The fallback was not a server read, so the re-selection revalidates.
    expect(threadFetches, afterFallback + 1);
  });

  test('a quiet failure is logged by type without its message', () async {
    final logs = <String>[];
    final previous = debugPrint;
    debugPrint = (message, {wrapWidth}) => logs.add(message ?? '');
    addTearDown(() => debugPrint = previous);
    serve(() => fixtureRange(1, 3));
    await harness.open();
    harness.repository.onListMessages = (conversationId, before) =>
        Future.error(StateError('secret user text'));

    await cubitOf().refresh(quietly: true, fresh: true);

    expect(logs.join('\n'), contains('StateError'));
    expect(logs.join('\n'), isNot(contains('secret user text')));
  });
}
