part of 'assistant_live_reply_guard_test.dart';

const _refusedNotice =
    'Live did not accept this message. Your draft was kept. '
    'Check the connection before trying again.';
const _unknownNotice =
    'Live delivery is uncertain. Your draft was kept. '
    'Check the conversation before resending to avoid duplicates.';

Future<void> _liveDraft(WidgetTester tester, BackgroundReplyHarness h) async {
  await _prepareDraft(tester, h);
  h.chat.clearReplyTarget();
  final live = h.pageContext.read<AssistantLiveCubit>();
  await _connect(live);
  await _browseFromLive(tester, h);
}

void liveDispatchCases() {
  for (final edit in ['reply', 'text', 'attachment', 'new upload']) {
    testWidgets('admitted Live clears only captured unchanged data: $edit', (
      tester,
    ) async {
      final wire = LiveDispatchTransport();
      final h = await _mount(tester, transport: wire);
      await _liveDraft(tester, h);
      final composer = _composer(tester);
      final captured = h.chat.state.composerAttachments.single;
      final sending = composer.onSend();
      // The real Cubit is awaiting readiness. These are later composer edits,
      // not changes to the already captured Live payload.
      expect(wire.textAttempts, 0);
      expect(h.chat.setReplyTarget(_answer), isTrue);
      final replyB = h.chat.state.replyTarget;
      var remaining = <AssistantAttachment>[];
      if (edit == 'text') composer.controller.text = 'Later draft B';
      if (edit == 'attachment') {
        remaining = [captured.copyWith(signedUrl: 'https://example.test/new')];
        h.chat.emit(h.chat.state.copyWith(composerAttachments: remaining));
      }
      if (edit == 'new upload') {
        final later = captured.copyWith(
          id: 'later-upload',
          name: 'later.txt',
          storagePath: 'synthetic/later.txt',
        );
        remaining = [later];
        h.chat.emit(
          h.chat.state.copyWith(composerAttachments: [captured, later]),
        );
      }
      await tester.pump();
      await sending;
      await tester.pump();
      expect(wire.textAttempts, 1);
      expect(wire.texts.single, contains(_draft));
      expect(wire.texts.single, contains('retained.txt'));
      expect(wire.texts.single, isNot(contains('Later draft B')));
      expect(wire.texts.single, isNot(contains('later.txt')));
      expect(h.chat.state.composerAttachments, remaining);
      expect(h.chat.state.replyTarget, same(replyB));
      expect(composer.controller.text, edit == 'text' ? 'Later draft B' : '');
      expect(h.repository.starts, 0);
      expect(find.text(_refusedNotice), findsNothing);
      expect(find.text(_unknownNotice), findsNothing);
    });
  }

  for (final failure in ['missing channel', 'closed channel', 'unknown']) {
    testWidgets('Live $failure keeps the draft and reports local evidence', (
      tester,
    ) async {
      final wire = LiveDispatchTransport();
      final h = await _mount(tester, transport: wire);
      await _liveDraft(tester, h);
      if (failure == 'missing channel') {
        await tester.runAsync(wire.socket.disconnect);
      }
      if (failure == 'closed channel') wire.closeCode = 1000;
      wire.throwAfterTextAdd = failure == 'unknown';
      final composer = _composer(tester);
      final draft = composer.controller.value;
      final attachments = h.chat.state.composerAttachments;
      await composer.onSend();
      await tester.pump();
      expect(composer.controller.value, draft);
      expect(h.chat.state.composerAttachments, attachments);
      expect(wire.textAttempts, failure == 'unknown' ? 1 : 0);
      expect(
        find.text(failure == 'unknown' ? _unknownNotice : _refusedNotice),
        findsOneWidget,
      );
      expect(h.repository.starts, 0);
      // A local admission receipt never fabricates a saved native message.
      expect(h.chat.state.messages.where((row) => row.role == 'user'), isEmpty);
      await tester.pump(const Duration(seconds: 1));
      expect(wire.textAttempts, failure == 'unknown' ? 1 : 0);
    });
  }

  for (final change in ['workspace', 'actor', 'conversation', 'local mode']) {
    testWidgets('Live $change departure fences dispatch and cleanup', (
      tester,
    ) async {
      final wire = LiveDispatchTransport();
      final h = await _mount(tester, transport: wire);
      await _liveDraft(tester, h);
      final composer = _composer(tester);
      final sending = composer.onSend();
      expect(wire.textAttempts, 0);
      switch (change) {
        case 'workspace':
          h.workspace.change('88888888-8888-4888-8888-888888888888');
        case 'actor':
          h.auth.change(const AuthState.unauthenticated());
        case 'conversation':
          unawaited(h.chat.openChatById(_workspace, 'other-chat'));
        case 'local mode':
          await tester.runAsync(
            () => h.pageContext.read<AssistantLocalChatCubit>().select(
              assistantLocalModels.first.id,
            ),
          );
      }
      await tester.pump();
      await sending;
      await tester.pump();
      expect(wire.textAttempts, 0);
      expect(find.text(_refusedNotice), findsNothing);
      expect(find.text(_unknownNotice), findsNothing);
      expect(h.repository.starts, 0);
    });
  }

  testWidgets('a newer Live invocation supersedes an awaiting old invocation', (
    tester,
  ) async {
    final wire = LiveDispatchTransport();
    final h = await _mount(tester, transport: wire);
    await _liveDraft(tester, h);
    final composer = _composer(tester);
    final first = composer.onSend();
    composer.controller.text = 'Newer submitted draft';
    final second = composer.onSend();
    await tester.pump();
    await Future.wait([first, second]);
    expect(wire.textAttempts, 1);
    expect(wire.texts.single, contains('Newer submitted draft'));
    expect(wire.texts.single, isNot(contains(_draft)));
    expect(composer.controller.text, isEmpty);
    expect(h.chat.state.composerAttachments, isEmpty);
    expect(h.repository.starts, 0);
  });
}
