import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart' as app_auth;

import 'assistant_native_dispatch_v116_harness.dart';
import 'assistant_settings_repair_harness.dart';
import 'background_reply_harness.dart';

// Synthetic transport cleanup gates; public Cubit and saved-USER checks
// stay real.
class _HeldReplyCleanup extends ReplyRepository {
  _HeldReplyCleanup() {
    stream.onCancel = () {
      cancelledA.complete();
      return releaseA.future;
    };
    replacement.onCancel = () {
      cancelledB.complete();
      return releaseB.future;
    };
  }

  final cancelledA = Completer<void>();
  final cancelledB = Completer<void>();
  final releaseA = Completer<void>();
  final releaseB = Completer<void>();

  void release() {
    if (!releaseA.isCompleted) releaseA.complete();
    if (!releaseB.isCompleted) releaseB.complete();
  }

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId, model: 'synthetic/model-a'),
    messages: const [],
    attachmentsByMessageId: const {},
  );
}

void main() {
  for (final ending in ['keep B', 'stop B', 'close B']) {
    testWidgets('old cleanup cannot replace current cleanup: $ending', (
      tester,
    ) async {
      final repository = _HeldReplyCleanup();
      final h = BackgroundReplyHarness(repository: repository);
      addTearDown(() async {
        repository.release();
        await h.dispose(tester);
      });
      await h.mount(tester);
      await h.chat.openChatById(repairWorkspace, repairChat);
      Future<AssistantSubmissionOutcome> send(String text) =>
          h.chat.submitAcknowledged(
            wsId: repairWorkspace,
            message: text,
            modelId: 'synthetic/model-a',
            thinkingMode: AssistantThinkingMode.fast,
            creditSource: AssistantCreditSource.workspace,
            workspaceContextId: repairWorkspace,
            timezone: 'UTC',
          );
      final sentA = send('A');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump();
      expect((await sentA).acknowledged, isTrue);
      expect(repository.starts, 1);
      var finishedA = false;
      final stoppingA = h.chat.stopStreaming().then((_) {
        finishedA = true;
      });
      expect(repository.cancelledA.isCompleted, isTrue);
      expect(finishedA, isFalse);
      const chatB = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      await h.chat.openChatById(repairWorkspace, chatB);
      expect(h.chat.state.storedChatId, chatB);
      expect(h.chat.state.isBusy, isFalse);
      final sentB = send('B');
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump();
      expect((await sentB).acknowledged, isTrue);
      expect(repository.starts, 2);
      expect(repository.replacement.hasListener, isTrue);
      expect(repository.cancelledB.isCompleted, isFalse);
      Future<void>? finishingB;
      var finishedB = false;
      if (ending != 'keep B') {
        final cleanup = ending == 'close B'
            ? h.chat.close()
            : h.chat.stopStreaming();
        finishingB = cleanup.then((_) {
          finishedB = true;
        });
        await tester.pump();
        expect(repository.cancelledB.isCompleted, isTrue);
        expect(finishedB, isFalse);
      }
      repository.releaseA.complete();
      await tester.runAsync(() => stoppingA);
      expect(finishedA, isTrue);
      if (ending == 'keep B') {
        expect(repository.cancelledB.isCompleted, isFalse);
        expect(repository.replacement.hasListener, isTrue);
        finishingB = h.chat.stopStreaming();
        expect(repository.cancelledB.isCompleted, isTrue);
      } else {
        expect(finishedB, isFalse);
      }
      repository.releaseB.complete();
      await tester.runAsync(() => finishingB!);
      expect(repository.cancelledA.isCompleted, isTrue);
      expect(repository.cancelledB.isCompleted, isTrue);
      expect(repository.starts, 2);
    });
  }

  testWidgets(
    'pending unexpected cleanup error remains observable to joiners',
    (tester) async {
      final repository = _HeldReplyCleanup();
      final h = BackgroundReplyHarness(repository: repository);
      addTearDown(() async {
        repository.release();
        await h.dispose(tester);
      });
      await h.mount(tester);
      await h.chat.openChatById(repairWorkspace, repairChat);
      final sent = h.chat.submitAcknowledged(
        wsId: repairWorkspace,
        message: 'Unexpected cleanup control',
        modelId: 'synthetic/model-a',
        thinkingMode: AssistantThinkingMode.fast,
        creditSource: AssistantCreditSource.workspace,
        workspaceContextId: repairWorkspace,
        timezone: 'UTC',
      );
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump();
      expect((await sent).acknowledged, isTrue);
      final failure = StateError('Synthetic cleanup failure');
      final first = expectLater(h.chat.stopStreaming(), throwsA(same(failure)));
      final second = expectLater(
        h.chat.stopStreaming(),
        throwsA(same(failure)),
      );
      expect(repository.cancelledA.isCompleted, isTrue);
      expect(repository.cancelledB.isCompleted, isFalse);
      repository.releaseA.completeError(failure);
      await tester.runAsync(() => Future.wait([first, second]));
      expect(repository.starts, 1);
    },
  );

  for (final retirement in [
    'actor B',
    'actor ABA',
    'mode ABA',
    'workspace ABA',
  ]) {
    testWidgets(
      'native final credentials boundary retires $retirement after settings A',
      (tester) async {
        final h = await tester.runAsync(NativeDispatchHarness.create);
        final fixture = h!;
        addTearDown(() => fixture.dispose(tester));
        await fixture.open(tester);
        fixture.port.armCredentials = true;
        await fixture.pageSend(tester, 'Original scoped text');
        await tester.runAsync(() => fixture.port.credentialsEntered.future);
        expect(fixture.port.settingsReads.last, repairActor);
        final original = fixture.chat.state.messages
            .lastWhere((m) => m.role == 'user')
            .clientRequestId;
        expect(fixture.port.posts, isEmpty);
        if (retirement.startsWith('actor')) {
          fixture.port.actor = '99999999-9999-4999-8999-999999999999';
          fixture.auth.change(
            app_auth.AuthState.authenticated(fixture.port.user),
          );
          await tester.pump();
          if (retirement == 'actor ABA') {
            fixture.port.actor = repairActor;
            fixture.auth.change(
              app_auth.AuthState.authenticated(fixture.port.user),
            );
            await tester.pump();
          }
        } else if (retirement == 'mode ABA') {
          final local = fixture.pageContext.read<AssistantLocalChatCubit>();
          // Record both selections synchronously. The obsolete local activation
          // is superseded before it can prepare a model or start inference.
          final a = local.select(assistantLocalModels.first.id);
          final b = local.select(null);
          await tester.runAsync(() => Future.wait([a, b]));
        } else {
          fixture.workspace.change('99999999-9999-4999-8999-999999999999');
          await tester.pump();
          fixture.workspace.change(repairWorkspace);
          await tester.pump();
        }
        fixture.port.release();
        await fixture.settle(tester);
        expect(
          fixture.port.posts,
          isEmpty,
          reason: 'Discarding callbacks cannot undo an HTTP dispatch',
        );
        if (retirement == 'mode ABA') {
          expect(
            fixture.chat.state.messages.where((m) => m.id == original),
            isEmpty,
          );
          await fixture.attach(tester, 'changed-after-unsent.txt');
          await fixture.pageSend(tester, 'Changed after proven unsent');
          expect(fixture.port.posts, hasLength(1));
          expect(fixture.port.posts.single['clientRequestId'], isNot(original));
          expect(
            fixture.chat.state.messages.where((m) => m.role == 'user'),
            hasLength(1),
          );
        }
      },
    );
  }
  testWidgets(
    'native held connectivity checks originating actor after settings',
    (tester) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.open(tester);
      h.port.holdConnectivity = true;
      await h.pageSend(tester, 'Queued A');
      await tester.runAsync(() => h.port.connectivityEntered.future);
      expect(h.port.settingsReads.last, repairActor);
      h.port.actor = '99999999-9999-4999-8999-999999999999';
      h.auth.change(app_auth.AuthState.authenticated(h.port.user));
      await tester.pump();
      h.port.release();
      await h.settle(tester);
      expect(h.port.posts, isEmpty);
    },
  );
  testWidgets(
    'connectivity mode ABA known unsent permits a changed next turn',
    (tester) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.open(tester);
      h.port.holdConnectivity = true;
      await h.attach(tester, 'original.txt');
      await h.pageSend(tester, 'Connectivity original');
      await tester.runAsync(() => h.port.connectivityEntered.future);
      final original = h.chat.state.messages
          .lastWhere((m) => m.role == 'user')
          .clientRequestId;
      final local = h.pageContext.read<AssistantLocalChatCubit>();
      final a = local.select(assistantLocalModels.first.id);
      final b = local.select(null);
      await tester.runAsync(() => Future.wait([a, b]));
      h.port.release();
      await h.settle(tester);
      expect(h.port.posts, isEmpty);
      expect(h.draft(tester).text, 'Connectivity original');
      expect(h.chat.state.composerAttachments, isNotEmpty);
      await h.attach(tester, 'changed.txt');
      await h.pageSend(tester, 'Connectivity changed');
      expect(h.port.posts, hasLength(1));
      expect(h.port.posts.single['clientRequestId'], isNot(original));
      expect(
        h.port.posts.single['attachments'].toString(),
        contains('changed.txt'),
      );
    },
  );
  testWidgets('concurrent cancellation awaits one trusted unsent cleanup', (
    tester,
  ) async {
    final h = (await tester.runAsync(NativeDispatchHarness.create))!;
    addTearDown(() => h.dispose(tester));
    await h.open(tester);
    h.port.holdHeaders();
    await h.pageSend(tester, 'Cancelled before dispatch');
    await tester.runAsync(() => h.port.credentialsEntered.future);
    var stopped = false;
    var stoppedAgain = false;
    final stopping = h.chat.stopStreaming(discardQueued: true).then((_) {
      stopped = true;
    });
    final stoppingAgain = h.chat.stopStreaming(discardQueued: true).then((_) {
      stoppedAgain = true;
    });
    await tester.pump();
    expect(stopped, isFalse);
    expect(stoppedAgain, isFalse);
    expect(h.port.posts, isEmpty);
    h.port.release();
    await tester.runAsync(() => Future.wait([stopping, stoppingAgain]));
    expect(stopped, isTrue);
    expect(stoppedAgain, isTrue);
    await h.settle(tester);
    expect(h.port.posts, isEmpty);
    expect(h.draft(tester).text, 'Cancelled before dispatch');
    await h.pageSend(tester, 'Changed after cancellation');
    expect(h.port.posts, hasLength(1));
    expect(h.port.posts.single['content'], 'Changed after cancellation');
    expect(h.chat.state.messages.where((m) => m.role == 'user'), hasLength(1));
  });
  testWidgets('first created turn known unsent removes its exact primed USER', (
    tester,
  ) async {
    void stage(String token) =>
        debugPrintSynchronously('PR6277_FIRST_TURN:$token');
    stage('create-before');
    final h = (await tester.runAsync(NativeDispatchHarness.create))!;
    stage('create-after');
    h.disposeProgress = stage;
    addTearDown(() async {
      stage('teardown-before');
      await h.dispose(tester);
      stage('teardown-after');
    });
    stage('mount-before');
    await h.mount(tester);
    stage('mount-after');
    await h.prepareNewConversation(tester);
    expect(h.chat.state.storedChatId, isNull);
    expect(h.chat.state.messages, isEmpty);
    h.port.holdHeaders();
    stage('first-send-before');
    await h.pageSend(tester, 'First new conversation turn');
    stage('first-send-after');
    stage('credentials-entered-before');
    await tester.runAsync(() => h.port.credentialsEntered.future);
    stage('credentials-entered-after');
    expect(h.port.creates, hasLength(1));
    expect(h.port.creates.single['initialAiSettings'], isNotNull);
    expect(h.port.settingsReads.last, repairActor);
    expect(h.chat.state.storedChatId, repairChat);
    final primed = h.chat.state.messages.single;
    final original = primed.clientRequestId;
    expect(original, isNotNull);
    expect(h.port.posts, isEmpty);
    stage('attach-before');
    await h.attach(tester, 'changed-first-draft.txt');
    stage('attach-after');
    await h.openComposer(tester);
    h.draft(tester).text = 'Edited while credentials held';
    final changedAttachments = h.chat.state.composerAttachments;
    final local = h.pageContext.read<AssistantLocalChatCubit>();
    final a = local.select(assistantLocalModels.first.id);
    final b = local.select(null);
    stage('mode-selection-before');
    await tester.runAsync(() => Future.wait([a, b]));
    stage('mode-selection-after');
    stage('release-before');
    h.port.release();
    stage('release-after');
    stage('release-settle-before');
    await h.settle(tester);
    stage('release-settle-after');
    expect(h.port.posts, isEmpty);
    expect(h.chat.state.messages.where((m) => identical(m, primed)), isEmpty);
    expect(h.chat.state.messages.where((m) => m.id == original), isEmpty);
    expect(h.draft(tester).text, 'Edited while credentials held');
    expect(h.chat.state.composerAttachments, changedAttachments);
    stage('changed-send-before');
    await h.pageSend(tester, 'Edited while credentials held');
    stage('changed-send-after');
    expect(h.port.creates, hasLength(1));
    expect(h.port.posts, hasLength(1));
    expect(h.port.posts.single['clientRequestId'], isNot(original));
    expect(
      h.port.posts.single['attachments'].toString(),
      contains('changed-first-draft.txt'),
    );
    final confirmed = h.chat.state.messages
        .where((m) => m.role == 'user')
        .single;
    expect(confirmed.id, h.port.saved.values.single['id']);
    expect(confirmed.clientRequestId, h.port.posts.single['clientRequestId']);
    expect(h.draft(tester).text, isEmpty);
    stage('body-complete');
  });
  testWidgets(
    'first-turn proof preserves a restored replacement with matching IDs',
    (tester) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await h.prepareNewConversation(tester);
      h.port.holdHeaders();
      await h.pageSend(tester, 'First primed text');
      await tester.runAsync(() => h.port.credentialsEntered.future);
      expect(h.port.creates, hasLength(1));
      final primed = h.chat.state.messages.single;
      final request = primed.clientRequestId!;
      // Synthetic history models an independently confirmed replacement.
      // This is not a message POST or a fabricated stream ACK.
      h.port.saved[request] = {
        'id': request,
        'conversationId': repairChat,
        'senderId': repairActor,
        'kind': 'user',
        'content': 'First primed text',
        'createdAt': '2026-10-18T00:00:00.123456Z',
        'metadata': {'clientRequestId': request},
        'attachments': [
          {
            'storagePath': 'chats/$repairChat/restored.txt',
            'filename': 'restored.txt',
            'contentType': 'text/plain',
            'sizeBytes': 3,
          },
        ],
      };
      // Separate history can load while the earlier refresh is held.
      // Public restore retires the old workspace operation lease.
      h.port.expired = false;
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, repairChat),
      );
      await h.settle(tester);
      final replacement = h.chat.state.messages.single;
      expect(identical(replacement, primed), isFalse);
      expect(replacement.id, primed.id);
      expect(replacement.clientRequestId, request);
      final restoredAttachments = h.chat.state.attachmentsByMessageId[request];
      expect(restoredAttachments!.single.name, 'restored.txt');
      await h.attach(tester, 'current-draft.txt');
      await h.openComposer(tester);
      h.draft(tester).text = 'Current changed draft';
      final changedAttachments = h.chat.state.composerAttachments;
      h.port.release();
      await h.settle(tester);
      expect(h.port.posts, isEmpty);
      expect(identical(h.chat.state.messages.single, replacement), isTrue);
      expect(h.chat.state.attachmentsByMessageId[request], restoredAttachments);
      expect(h.draft(tester).text, 'Current changed draft');
      expect(h.chat.state.composerAttachments, changedAttachments);
    },
  );
  for (final background in [false, true]) {
    testWidgets('same actor native admission permits background=$background', (
      tester,
    ) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.open(tester);
      h.port.armCredentials = true;
      await h.pageSend(tester, 'Allowed A');
      await tester.runAsync(() => h.port.credentialsEntered.future);
      if (background) {
        h.pause(tester);
        await tester.pump();
      }
      h.port.release();
      await h.settle(tester);
      expect(h.port.posts, hasLength(1));
      expect(h.port.posts.single['content'], 'Allowed A');
      expect(h.port.authorizations.single, 'Bearer synthetic-$repairActor');
      if (background) {
        h.resume(tester);
        await h.settle(tester);
      }
      expect(
        h.chat.state.messages.where((m) => m.role == 'user'),
        hasLength(1),
      );
    });
  }
}
