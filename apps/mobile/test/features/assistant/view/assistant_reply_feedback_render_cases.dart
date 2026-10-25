part of 'assistant_live_reply_guard_test.dart';

void replyFeedbackRenderCases() {
  for (final dark in [false, true]) {
    testWidgets('reply-change notice renders in ${dark ? 'dark' : 'light'}', (
      tester,
    ) async {
      configureAssistantRaster(tester);
      final h = await _mount(
        tester,
        themeMode: dark ? ThemeMode.dark : ThemeMode.light,
      );
      expect(
        Theme.of(h.pageContext).brightness,
        dark ? Brightness.dark : Brightness.light,
      );
      await _prepareDraft(tester, h);
      _addNextAnswer(h);
      await tester.pump();
      final composer = _composer(tester);
      final draft = composer.controller.value;
      final attachments = h.chat.state.composerAttachments;
      final timezone = _holdTimezone(tester);
      final sending = composer.onSend();
      await tester.pump();
      expect(timezone.entered.isCompleted, isTrue);
      expect(h.chat.setReplyTarget(_nextAnswer), isTrue);
      timezone.release.complete('UTC');
      await tester.pump();
      await sending;
      await tester.pump(const Duration(milliseconds: 300));
      await tester.pump();
      expect(_composer(tester).chatState.replyTarget?.id, _nextAnswer);
      expect(find.text(_replyChangedNotice), findsOneWidget);
      expect(h.repository.starts, 0);
      expect(composer.controller.value, draft);
      expect(h.chat.state.composerAttachments, attachments);
      expect(h.chat.state.replyTarget?.id, _nextAnswer);
      final preview = find.byKey(const ValueKey('assistant-reply-preview'));
      expect(
        find.descendant(of: preview, matching: find.text('Next saved answer')),
        findsOneWidget,
      );
      expect(
        tester.getRect(find.byKey(const ValueKey('app-toast'))).bottom,
        lessThan(tester.getRect(preview).top),
      );
      await renderAssistantComponent(
        tester,
        'assistant-reply-feedback-${dark ? 'dark' : 'light'}',
      );
    });
  }
}
