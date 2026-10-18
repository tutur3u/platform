import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';

import '../../../helpers/helpers.dart';
import 'assistant_settings_repair_harness.dart';
import 'assistant_v87_harness.dart';

void main() {
  testWidgets(
    'native history A B A hydrates exact tuple without manage_chat PATCH',
    (tester) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      for (final id in [repairChat, chatB, repairChat]) {
        await tester.runAsync(() => h.chat.openChatById(repairWorkspace, id));
        await tester.pumpAndSettle();
        await h.pageSend(tester, 'Follow up $id');
        expect(h.draft(tester).text, isEmpty, reason: '${h.chat.state.error}');
      }
      expect(h.repo.chats.sends, 3);
      expect(h.repo.api.patches, 0);
      expect(
        h.pageContext.read<AssistantShellCubit>().state.thinkingMode.name,
        'fast',
      );
    },
  );
  testWidgets(
    'fresh client native nullable default settings send without mutation',
    (tester) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, repairChat),
      );
      await tester.pumpAndSettle();
      await h.pageSend(tester, 'Fresh follow up');
      expect(h.draft(tester).text, isEmpty, reason: '${h.chat.state.error}');
      expect(h.repo.chats.sends, 1);
      expect(h.repo.api.patches, 0);
    },
  );
  testWidgets('legacy real server-shaped SSE durable save '
      'acknowledges page and repeated Send', (tester) async {
    final h = V87Harness();
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await tester.runAsync(
      () => h.chat.openChatById(repairWorkspace, legacyChat),
    );
    await tester.pumpAndSettle();
    await h.pageSend(tester, 'Legacy first');
    expect(h.draft(tester).text, isEmpty, reason: '${h.chat.state.error}');
    expect(h.repo.api.users, hasLength(1));
    expect(h.repo.api.streamBodies.single['persistenceRequestId'], isNotNull);
    await h.pageSend(tester, 'Legacy next');
    expect(h.draft(tester).text, isEmpty);
    expect(h.repo.api.users, hasLength(2));
    expect(h.repo.api.patches, 0);
    await tester.drainShadToastTimers();
  });
  testWidgets(
    'stale native A restore cannot replace B settings or admit wrong send',
    (tester) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      final api = h.repo.api..restoreGate = Completer<void>();
      late Future<void> old;
      await tester.runAsync(() async {
        old = h.chat.openChatById(repairWorkspace, repairChat);
        await api.restoreEntered.future;
      });
      await tester.runAsync(() => h.chat.openChatById(repairWorkspace, chatB));
      api.restoreGate!.complete();
      await tester.runAsync(() => old);
      await tester.pumpAndSettle();
      await h.pageSend(tester, 'Current B');
      expect(h.draft(tester).text, isEmpty, reason: '${h.chat.state.error}');
      expect(
        h.pageContext.read<AssistantShellCubit>().state.selectedModel.value,
        'synthetic/model-b',
      );
      expect(api.patches, 0);
    },
  );
  testWidgets(
    'legacy unknown repeat reads durable original without second dispatch',
    (tester) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, legacyChat),
      );
      await h.attach(tester);
      final attachments = h.chat.state.composerAttachments;
      expect(attachments, hasLength(1));
      final api = h.repo.api..hideReceipt = true;
      await h.pageSend(tester, 'Unknown draft');
      expect(h.draft(tester).text, 'Unknown draft');
      expect(h.chat.state.composerAttachments, attachments);
      expect(api.users, hasLength(1));
      expect(api.streamBodies, hasLength(1));
      api.hideReceipt = false;
      await h.pageSend(tester, 'Unknown draft');
      expect(h.draft(tester).text, isEmpty, reason: '${h.chat.state.error}');
      expect(api.streamBodies, hasLength(1));
      expect(api.users, hasLength(1));
      expect(h.chat.state.composerAttachments, isEmpty);
      await tester.drainShadToastTimers();
    },
  );
  testWidgets('legacy text DONE without durable save retains draft; '
      'explicit retry keeps identity', (tester) async {
    final h = V87Harness();
    addTearDown(() => h.dispose(tester));
    await h.mount(tester);
    await tester.runAsync(
      () => h.chat.openChatById(repairWorkspace, legacyChat),
    );
    final api = h.repo.api..omitDurableSave = true;
    await h.pageSend(tester, 'Unconfirmed');
    expect(h.draft(tester).text, 'Unconfirmed');
    expect(api.users, isEmpty);
    api.omitDurableSave = false;
    await h.pageSend(tester, 'Unconfirmed');
    expect(h.draft(tester).text, isEmpty, reason: '${h.chat.state.error}');
    expect(api.streamBodies, hasLength(2));
    expect(
      api.streamBodies[0]['persistenceRequestId'],
      api.streamBodies[1]['persistenceRequestId'],
    );
    expect(api.users, hasLength(1));
    await tester.drainShadToastTimers();
  });
  testWidgets(
    'legacy lost stream response accepts only durable request readback',
    (tester) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, legacyChat),
      );
      h.repo.api.failAfterSave = true;
      await h.pageSend(tester, 'Saved despite lost response');
      expect(h.draft(tester).text, isEmpty);
      expect(h.chat.state.error, isNotNull);
      expect(h.repo.api.users, hasLength(1));
      expect(h.repo.api.streamBodies, hasLength(1));
      await tester.drainShadToastTimers();
    },
  );

  for (final departure in ['actor ABA', 'workspace ABA', 'close']) {
    testWidgets('native restore $departure never publishes stale settings', (
      tester,
    ) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      final shell = h.pageContext.read<AssistantShellCubit>();
      final api = h.repo.api..restoreGate = Completer<void>();
      late Future<void> old;
      await tester.runAsync(() async {
        old = h.chat.openChatById(repairWorkspace, repairChat);
        await api.restoreEntered.future;
      });
      if (departure == 'actor ABA') {
        final original = h.auth.state;
        h.auth.change(const AuthState.unauthenticated());
        await tester.pumpAndSettle();
        h.auth.change(original);
        await tester.pumpAndSettle();
      } else if (departure == 'workspace ABA') {
        h.workspace.change('99999999-9999-4999-8999-999999999999');
        await tester.pumpAndSettle();
        h.workspace.change(repairWorkspace);
        await tester.pumpAndSettle();
      } else {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump();
      }
      if (departure != 'close') {
        await tester.runAsync(
          () => h.chat.openChatById(repairWorkspace, chatB),
        );
      }
      final prior = shell.state;
      api.restoreGate!.complete();
      await tester.runAsync(() => old);
      await tester.pumpAndSettle();
      expect(shell.state.selectedModel, prior.selectedModel);
      expect(shell.state.creditSource, prior.creditSource);
      expect(api.patches, 0);
      if (departure != 'close') {
        await h.pageSend(tester, 'Current B after $departure');
        expect(h.draft(tester).text, isEmpty, reason: '${h.chat.state.error}');
      }
    });
  }
  testWidgets(
    'legacy real server file markup requires original-text durable receipt',
    (tester) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, legacyChat),
      );
      await h.attach(tester);
      h.repo.api.augmentedContent = true;
      await h.pageSend(tester, 'Read attachment');
      expect(
        h.repo.api.users.single['content'],
        'Read attachment\n[File: attached]',
      );
      expect(h.draft(tester).text, isEmpty, reason: '${h.chat.state.error}');
      expect(h.chat.state.composerAttachments, isEmpty);
      await tester.drainShadToastTimers();
    },
  );

  for (final historical in [true, false]) {
    testWidgets('legacy ${historical ? 'historical row' : 'conflicting text'} '
        'receipt stays honest', (tester) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, legacyChat),
      );
      h.repo.api.originalTextMetadata = !historical;
      if (!historical) h.repo.api.wrongRequestText = 'Foreign original';
      await h.pageSend(tester, 'Original draft');
      expect(h.draft(tester).text, historical ? isEmpty : 'Original draft');
      expect(h.repo.api.users, hasLength(1));
      expect(h.repo.api.streamBodies, hasLength(1));
      await tester.drainShadToastTimers();
    });
  }
  testWidgets(
    'legacy saved user before model error consumes draft and keeps failure',
    (tester) async {
      final h = V87Harness();
      addTearDown(() => h.dispose(tester));
      await h.mount(tester);
      await tester.runAsync(
        () => h.chat.openChatById(repairWorkspace, legacyChat),
      );
      h.repo.api.modelFailure = true;
      await h.pageSend(tester, 'Saved user then failed model');
      expect(h.repo.api.users, hasLength(1));
      expect(h.draft(tester).text, isEmpty);
      expect(h.chat.state.error, 'Model failed');
      expect(h.repo.api.streamBodies, hasLength(1));
      await tester.drainShadToastTimers();
    },
  );
}
