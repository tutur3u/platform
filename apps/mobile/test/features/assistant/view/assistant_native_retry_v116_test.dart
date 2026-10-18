import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';

import 'assistant_native_dispatch_v116_harness.dart';

void main() {
  testWidgets(
    'lost R explicit Retry ACK retires pending without clearing changed '
    'draft attachments',
    (tester) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.open(tester);
      await h.attach(tester, 'original.txt');
      h.port.loseFirstReceipt = true;
      await h.pageSend(tester, 'Original text');
      final original = h.port.posts.single['clientRequestId'];
      expect(h.draft(tester).text, 'Original text');
      await h.attach(tester, 'changed.txt');
      h.draft(tester).text = 'Changed current draft';
      final changedAttachments = h.chat.state.composerAttachments;
      await h.retry(tester);
      expect(h.port.posts, hasLength(2));
      expect(h.port.posts[1]['clientRequestId'], original);
      expect(h.draft(tester).text, 'Changed current draft');
      expect(h.chat.state.composerAttachments, changedAttachments);
      await h.pageSend(tester, 'Changed current draft');
      expect(h.port.posts, hasLength(3));
      expect(h.port.posts.last['clientRequestId'], isNot(original));
      expect(h.draft(tester).text, isEmpty);
      expect(h.port.saved, hasLength(2));
    },
  );
  testWidgets('foreign Retry USER receipt retains unknown original and blocks '
      'replacement', (tester) async {
    final h = (await tester.runAsync(NativeDispatchHarness.create))!;
    addTearDown(() => h.dispose(tester));
    await h.open(tester);
    h.port
      ..loseFirstReceipt = true
      ..foreignRetry = true;
    await h.pageSend(tester, 'Held original');
    await h.retry(tester);
    expect(h.port.posts, hasLength(2));
    await h.pageSend(tester, 'Changed next');
    expect(h.port.posts, hasLength(2));
    expect(h.draft(tester).text, 'Changed next');
  });
  testWidgets(
    'stale Retry receipt cannot retire current native pending identity',
    (tester) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.open(tester);
      h.port.loseFirstReceipt = true;
      await h.pageSend(tester, 'Held original');
      final gate = Completer<void>();
      h.port
        ..responseGate = gate
        ..postEntered = Completer<void>();
      await h.retry(tester);
      await tester.runAsync(() => h.port.postEntered.future);
      final local = h.pageContext.read<AssistantLocalChatCubit>();
      final a = local.select(assistantLocalModels.first.id);
      final b = local.select(null);
      await tester.runAsync(() => Future.wait([a, b]));
      gate.complete();
      await h.settle(tester);
      // Explicit stop settles a retired retry's UI; it is never an ACK.
      await tester.runAsync(() => h.chat.stopStreaming());
      await h.pageSend(tester, 'Changed next');
      expect(h.port.posts, hasLength(2));
      expect(h.draft(tester).text, 'Changed next');
    },
  );
  testWidgets(
    'HTTP-invoked lost receipt holds R despite an unsent explicit retry',
    (tester) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.open(tester);
      await h.attach(tester, 'original.txt');
      h.port.loseFirstReceipt = true;
      await h.pageSend(tester, 'Unknown original');
      final original = h.port.posts.single['clientRequestId'];
      h.port.holdHeaders();
      await h.retry(tester);
      await tester.runAsync(() => h.port.credentialsEntered.future);
      final local = h.pageContext.read<AssistantLocalChatCubit>();
      final a = local.select(assistantLocalModels.first.id);
      final b = local.select(null);
      await tester.runAsync(() => Future.wait([a, b]));
      h.port.release();
      await h.settle(tester);
      await tester.runAsync(() => h.chat.stopStreaming());
      await h.attach(tester, 'changed.txt');
      await h.pageSend(tester, 'Changed while unknown');
      expect(h.port.posts, hasLength(1));
      expect(h.port.posts.single['clientRequestId'], original);
      expect(h.draft(tester).text, 'Changed while unknown');
      expect(h.chat.state.composerAttachments, isNotEmpty);
    },
  );
  testWidgets(
    'durable queue handoff retains original reservation without HTTP',
    (tester) async {
      void stage(String name) =>
          debugPrintSynchronously('PR6277_DURABLE_QUEUE:$name');
      stage('create-before');
      final h = (await tester.runAsync(
        () => NativeDispatchHarness.create(realAsyncQueuedWrites: true),
      ))!;
      stage('create-after');
      h.disposeProgress = stage;
      addTearDown(() async {
        stage('teardown-before');
        await h.dispose(tester);
        stage('teardown-after');
      });
      stage('open-before');
      await h.open(tester);
      stage('open-after');
      h.port.offline = true;
      stage('send-original-before');
      await h.pageSend(tester, 'Queued original');
      stage('send-original-after');
      stage('pending-first-before');
      final pending = await tester.runAsync(h.queue.listPending);
      stage('pending-first-after');
      expect(pending, isNotEmpty);
      expect(h.port.posts, isEmpty);
      stage('send-changed-before');
      await h.pageSend(tester, 'Changed queued draft');
      stage('send-changed-after');
      expect(h.port.posts, isEmpty);
      expect(h.draft(tester).text, 'Changed queued draft');
      stage('pending-second-before');
      final after = await tester.runAsync(h.queue.listPending);
      stage('pending-second-after');
      expect(after!.map((r) => r.id), pending!.map((r) => r.id));
      stage('body-complete');
    },
  );
  testWidgets('foreign old unsent proof cannot release a fresh reservation', (
    tester,
  ) async {
    final h = (await tester.runAsync(NativeDispatchHarness.create))!;
    addTearDown(() => h.dispose(tester));
    await h.open(tester);
    final repository = h.repository as NativeDispatchRepository;
    Future<void> suppress(String text) async {
      h.port.holdHeaders();
      await h.pageSend(tester, text);
      await tester.runAsync(() => h.port.credentialsEntered.future);
      final local = h.pageContext.read<AssistantLocalChatCubit>();
      final a = local.select(assistantLocalModels.first.id);
      final b = local.select(null);
      await tester.runAsync(() => Future.wait([a, b]));
      h.port.release();
      await h.settle(tester);
    }

    await suppress('First known unsent');
    expect(repository.lastFailure, isNotNull);
    repository.substituteFailure = repository.lastFailure;
    h.port.postFailure = StateError('Synthetic invoked-request failure');
    await h.pageSend(tester, 'Fresh dispatched reservation');
    expect(h.port.posts, hasLength(1));
    await tester.runAsync(() => h.chat.stopStreaming());
    await h.pageSend(tester, 'Changed blocked by foreign proof');
    expect(h.port.posts, hasLength(1));
    expect(h.draft(tester).text, 'Changed blocked by foreign proof');
  });
  testWidgets('acknowledged equal text remains a new native turn', (
    tester,
  ) async {
    final h = (await tester.runAsync(NativeDispatchHarness.create))!;
    addTearDown(() => h.dispose(tester));
    await h.open(tester);
    await h.pageSend(tester, 'Equal text');
    await h.pageSend(tester, 'Equal text');
    expect(h.port.posts, hasLength(2));
    expect(
      h.port.posts[0]['clientRequestId'],
      isNot(h.port.posts[1]['clientRequestId']),
    );
  });
}
