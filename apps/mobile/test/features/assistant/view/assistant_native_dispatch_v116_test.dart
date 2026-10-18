// UNEXECUTED regression specification: dependencies/admission are held.
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/local/assistant_local_chat_cubit.dart';
import 'package:mobile/features/assistant/local/assistant_local_model.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart' as app_auth;

import 'assistant_native_dispatch_v116_harness.dart';
import 'assistant_settings_repair_harness.dart';

void main() {
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
  testWidgets(
    'cancelled native listener still receives trusted unsent cleanup',
    (tester) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.open(tester);
      h.port.holdHeaders();
      await h.pageSend(tester, 'Cancelled before dispatch');
      await tester.runAsync(() => h.port.credentialsEntered.future);
      final stopped = h.chat.stopStreaming(discardQueued: true);
      h.port.release();
      await tester.runAsync(() => stopped);
      await h.settle(tester);
      expect(h.port.posts, isEmpty);
      expect(h.draft(tester).text, 'Cancelled before dispatch');
      await h.pageSend(tester, 'Changed after cancellation');
      expect(h.port.posts, hasLength(1));
      expect(h.port.posts.single['content'], 'Changed after cancellation');
      expect(
        h.chat.state.messages.where((m) => m.role == 'user'),
        hasLength(1),
      );
    },
  );
  testWidgets('first created turn known unsent removes its exact primed USER', (
    tester,
  ) async {
    final h = (await tester.runAsync(NativeDispatchHarness.create))!;
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    expect(h.chat.state.storedChatId, isNull);
    expect(h.chat.state.messages, isEmpty);
    h.port.holdHeaders();
    await h.pageSend(tester, 'First new conversation turn');
    await tester.runAsync(() => h.port.credentialsEntered.future);
    expect(h.port.creates, hasLength(1));
    expect(h.port.creates.single['initialAiSettings'], isNotNull);
    expect(h.port.settingsReads.last, repairActor);
    expect(h.chat.state.storedChatId, repairChat);
    final primed = h.chat.state.messages.single;
    final original = primed.clientRequestId;
    expect(original, isNotNull);
    expect(h.port.posts, isEmpty);
    await h.attach(tester, 'changed-first-draft.txt');
    h.draft(tester).text = 'Edited while credentials held';
    final changedAttachments = h.chat.state.composerAttachments;
    final local = h.pageContext.read<AssistantLocalChatCubit>();
    final a = local.select(assistantLocalModels.first.id);
    final b = local.select(null);
    await tester.runAsync(() => Future.wait([a, b]));
    h.port.release();
    await h.settle(tester);
    expect(h.port.posts, isEmpty);
    expect(h.chat.state.messages.where((m) => identical(m, primed)), isEmpty);
    expect(h.chat.state.messages.where((m) => m.id == original), isEmpty);
    expect(h.draft(tester).text, 'Edited while credentials held');
    expect(h.chat.state.composerAttachments, changedAttachments);
    await h.pageSend(tester, 'Edited while credentials held');
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
  });
  testWidgets(
    'first-turn proof preserves a restored replacement with matching IDs',
    (tester) async {
      final h = (await tester.runAsync(NativeDispatchHarness.create))!;
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
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
            'path': 'chats/$repairChat/restored.txt',
            'name': 'restored.txt',
            'type': 'text/plain',
            'size': 3,
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
