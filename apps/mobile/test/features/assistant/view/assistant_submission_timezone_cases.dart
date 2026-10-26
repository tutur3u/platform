part of 'assistant_live_reply_guard_test.dart';

const _replyChangedNotice =
    'The reply changed before sending. Your draft was kept. '
    'Review it and send again.';
const _nextAnswer = '99999999-9999-4999-8999-999999999999';

({Completer<void> entered, Completer<String> release}) _holdTimezone(
  WidgetTester tester,
) {
  final entered = Completer<void>();
  final timezone = Completer<String>();
  var calls = 0;
  tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
    const MethodChannel('flutter_timezone'),
    (_) {
      expect(++calls, 1);
      entered.complete();
      return timezone.future;
    },
  );
  return (entered: entered, release: timezone);
}

void _addNextAnswer(BackgroundReplyHarness h) {
  h.chat.emit(
    h.chat.state.copyWith(
      messages: [
        ...h.chat.state.messages,
        const AssistantMessage(
          id: _nextAnswer,
          role: 'assistant',
          isPersisted: true,
          parts: [
            AssistantMessagePart(type: 'text', text: 'Next saved answer'),
          ],
        ),
      ],
    ),
  );
}

void submissionTimezoneCases() {
  for (final editDraft in [false, true]) {
    testWidgets('reply changes during timezone await: edited=$editDraft', (
      tester,
    ) async {
      final h = await _mount(tester);
      await _prepareDraft(tester, h);
      _addNextAnswer(h);
      await tester.pump();
      final composer = _composer(tester);
      final timezone = _holdTimezone(tester);
      final sending = composer.onSend();
      await tester.pump();
      expect(timezone.entered.isCompleted, isTrue);
      expect(h.repository.starts, 0);
      expect(find.text(_replyChangedNotice), findsNothing);
      tester
          .widgetList<AssistantTranscriptBubble>(
            find.byType(AssistantTranscriptBubble),
          )
          .singleWhere((bubble) => bubble.text == 'Next saved answer')
          .onReply!();
      expect(h.chat.state.replyTarget?.id, _nextAnswer);
      if (editDraft) {
        composer.controller.value = const TextEditingValue(
          text: 'New draft for B',
          selection: TextSelection.collapsed(offset: 4),
        );
        await tester.runAsync(
          () => h.chat.addComposerAttachments(
            wsId: _workspace,
            files: [
              GalleryPlatformFile(
                XFile.fromData(
                  Uint8List.fromList([4]),
                  name: 'new.txt',
                  path: 'new.txt',
                ),
              ),
            ],
            modelId: 'synthetic-model',
            timezone: 'UTC',
          ),
        );
      }
      final draft = composer.controller.value;
      final attachments = h.chat.state.composerAttachments;
      expect(attachments.length, editDraft ? 2 : 1);
      timezone.release.complete('UTC');
      await tester.pump();
      await sending;
      await tester.pump();
      expect(find.text(_replyChangedNotice), findsOneWidget);
      expect(h.repository.starts, 0);
      expect(h.pageContext.read<AssistantLiveCubit>().state.userDraft, isEmpty);
      expect(composer.controller.value, draft);
      expect(h.chat.state.composerAttachments, attachments);
      expect(h.chat.state.replyTarget?.id, _nextAnswer);
    });
  }

  testWidgets(
    'unchanged reply during timezone await sends once and needs ACK',
    (tester) async {
      final h = await _mount(tester);
      final repository = h.repository as _Repository;
      await _prepareDraft(tester, h);
      final composer = _composer(tester);
      final draft = composer.controller.value;
      final attachments = h.chat.state.composerAttachments;
      final timezone = _holdTimezone(tester);
      var completed = false;
      final sending = composer.onSend().then((_) => completed = true);
      await tester.pump();
      expect(timezone.entered.isCompleted, isTrue);
      expect(repository.starts, 0);
      timezone.release.complete('UTC');
      for (var i = 0; i < 8 && repository.starts == 0; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(repository.starts, 1);
      expect(repository.sent!.last.replyToMessageId, _answer);
      expect(repository.sentAttachments, attachments);
      expect(completed, isFalse);
      expect(composer.controller.value, draft);
      expect(h.chat.state.composerAttachments, attachments);
      expect(find.text(_replyChangedNotice), findsNothing);
      repository.acknowledge();
      await tester.pump();
      await sending;
      expect(completed, isTrue);
      expect(repository.starts, 1);
      expect(composer.controller.text, isEmpty);
      expect(h.chat.state.composerAttachments, isEmpty);
      expect(h.chat.state.replyTarget, isNull);
      expect(find.text(_replyChangedNotice), findsNothing);
    },
  );

  for (final departure in ['actor', 'workspace', 'mode']) {
    testWidgets('no reply-change notice after $departure retirement', (
      tester,
    ) async {
      final h = await _mount(tester);
      await _prepareDraft(tester, h);
      final composer = _composer(tester);
      final timezone = _holdTimezone(tester);
      final sending = composer.onSend();
      await tester.pump();
      expect(timezone.entered.isCompleted, isTrue);
      composer.onCancelReply!();
      switch (departure) {
        case 'actor':
          h.auth.change(const AuthState.unauthenticated());
        case 'workspace':
          h.workspace.change('88888888-8888-4888-8888-888888888888');
        case 'mode':
          final local = h.pageContext.read<AssistantLocalChatCubit>();
          // Retire the old mode even when selection returns to remote (ABA).
          final localSelection = local.select(assistantLocalModels.first.id);
          final remoteSelection = local.select(null);
          await tester.runAsync(
            () => Future.wait([localSelection, remoteSelection]),
          );
      }
      await tester.pump();
      timezone.release.complete('UTC');
      await tester.pump();
      await sending;
      await tester.pump();
      expect(h.repository.starts, 0);
      expect(find.text(_replyChangedNotice), findsNothing);
      expect(find.text(_notice), findsNothing);
    });
  }
}
