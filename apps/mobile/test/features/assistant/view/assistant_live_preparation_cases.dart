part of 'assistant_live_reply_guard_test.dart';

const _canonicalLiveChat = 'ai-chat-$_chat';
const _preparedEnvelope = AssistantLiveTokenEnvelope(
  token: 'synthetic-local-only',
  chatId: _chat,
  scopeKey: 'synthetic-scope',
  model: 'synthetic-model',
  sessionHandle: null,
  seedHistory: [],
);

class _PreparationLiveRepository extends AssistantLiveRepository {
  final token = Completer<AssistantLiveTokenEnvelope>();
  int requests = 0;

  @override
  Future<AssistantLiveTokenEnvelope> fetchLiveToken({
    required String wsId,
    String? chatId,
    String? model,
    bool forceFresh = false,
  }) {
    requests++;
    expect(wsId, _workspace);
    expect(chatId, _chat);
    return token.future;
  }
}

class _PreparationChatRepository extends _Repository {
  final restoredIds = <String>[];
  Completer<void>? nextHistory;
  bool historyEntered = false;

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async {
    restoredIds.add(chatId);
    final gate = nextHistory;
    nextHistory = null;
    if (gate != null) {
      historyEntered = true;
      await gate.future;
    }
    return await super.restoreChat(
      wsId: wsId,
      chatId: chatId,
      forceRefresh: forceRefresh,
      cacheOrigin: cacheOrigin,
    );
  }
}

class _PreparationPage {
  _PreparationPage(this.h, this.wire, this.repository, this.liveRepository);

  final BackgroundReplyHarness h;
  final LiveDispatchTransport wire;
  final _PreparationChatRepository repository;
  final _PreparationLiveRepository liveRepository;
  final history = Completer<void>();
  AssistantLiveCubit get live => h.pageContext.read<AssistantLiveCubit>();
  int get connections =>
      wire.admitted.where((frame) => frame.containsKey('setup')).length;

  void releaseToken() => liveRepository.token.complete(_preparedEnvelope);
}

Future<_PreparationPage> _preparationPage(
  WidgetTester tester, {
  AssistantLiveConnectionStatus status = AssistantLiveConnectionStatus.error,
  String selectedChat = _canonicalLiveChat,
}) async {
  const pcm = MethodChannel('flutter_pcm_sound/methods');
  final messenger = tester.binding.defaultBinaryMessenger
    ..setMockMethodCallHandler(pcm, (_) async => true);
  addTearDown(() => messenger.setMockMethodCallHandler(pcm, null));
  final wire = LiveDispatchTransport()..autoReady = true;
  final repository = _PreparationChatRepository();
  final liveRepository = _PreparationLiveRepository();
  final h = await _mount(
    tester,
    transport: wire,
    liveRepository: liveRepository,
    repository: repository,
    openTransport: false,
  );
  await h.chat.openChatById(_workspace, selectedChat);
  await tester.pumpAndSettle();
  if (find.byType(AssistantComposerFab).evaluate().isNotEmpty) {
    await tester.tap(find.byType(AssistantComposerFab));
    await tester.pumpAndSettle();
  }
  _composer(tester).controller.value = const TextEditingValue(
    text: _draft,
    selection: TextSelection(baseOffset: 2, extentOffset: 9),
  );
  await tester.runAsync(
    () => h.chat.addComposerAttachments(
      wsId: _workspace,
      files: [
        GalleryPlatformFile(
          XFile.fromData(
            Uint8List.fromList([1, 2, 3]),
            name: 'retained.txt',
            path: 'retained.txt',
          ),
        ),
      ],
      modelId: 'synthetic-model',
      timezone: 'UTC',
    ),
  );
  await tester.pumpAndSettle();
  expect(h.chat.state.composerAttachments.single.isUploaded, isTrue);
  final fixture = _PreparationPage(h, wire, repository, liveRepository);
  fixture.live.emit(
    AssistantLiveState(workspaceId: _workspace, chatId: _chat, status: status),
  );
  repository.nextHistory = fixture.history;
  addTearDown(() {
    if (!liveRepository.token.isCompleted) fixture.releaseToken();
    if (!fixture.history.isCompleted) fixture.history.complete();
  });
  await tester.pump();
  expect(fixture.connections, 0);
  return fixture;
}

Future<void> _untilPreparation(
  WidgetTester tester,
  bool Function() reached,
) async {
  for (var i = 0; i < 8 && !reached(); i++) {
    await tester.pump();
  }
  expect(reached(), isTrue);
}

/// Retiring an opened provider closes the fake transport's stream, which needs
/// real event-loop turns; a retired send settles only after that teardown.
Future<void> _untilSettled(WidgetTester tester, Future<Object?> sending) async {
  var settled = false;
  unawaited(sending.whenComplete(() => settled = true));
  for (var i = 0; i < 20 && !settled; i++) {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump(const Duration(milliseconds: 50));
  }
  expect(settled, isTrue);
  await sending;
}

void _departPreparation(_PreparationPage fixture, String change) {
  final h = fixture.h;
  switch (change) {
    case 'actor':
      h.auth.change(const AuthState.unauthenticated());
    case 'workspace':
      h.workspace.change('88888888-8888-4888-8888-888888888888');
    case 'conversation':
      unawaited(h.chat.openChatById(_workspace, 'other-chat'));
    case 'same canonical selection':
      unawaited(h.chat.openChatById(_workspace, _canonicalLiveChat));
  }
}

void livePreparationCases() {
  for (final status in [
    AssistantLiveConnectionStatus.error,
    AssistantLiveConnectionStatus.reconnecting,
  ]) {
    for (final laterEdit in [false, true]) {
      testWidgets('Page prepares from ${status.name}, holds token/history, '
          'and clears only its snapshot (later edit: $laterEdit)', (
        tester,
      ) async {
        final f = await _preparationPage(tester, status: status);
        final composer = _composer(tester);
        final draft = composer.controller.value;
        final attachments = f.h.chat.state.composerAttachments;
        final version = f.h.chat.attachmentScopeVersion;
        final restores = f.repository.restoredIds.length;
        final sending = composer.onSend();
        await _untilPreparation(tester, () => f.liveRepository.requests == 1);
        expect(f.live.state.status, AssistantLiveConnectionStatus.preparing);
        expect(f.connections, 0);
        expect(f.wire.textAttempts, 0);
        expect(composer.controller.value, draft);
        expect(f.h.chat.state.composerAttachments, attachments);
        f.releaseToken();
        await _untilPreparation(tester, () => f.repository.historyEntered);
        // The provider handshake overlaps binding; the send stays held.
        await _untilPreparation(tester, () => f.connections == 1);
        expect(f.repository.restoredIds.length, restores + 1);
        expect(f.repository.restoredIds.last, _canonicalLiveChat);
        expect(f.h.chat.attachmentScopeVersion, version + 1);
        expect(f.wire.textAttempts, 0);
        expect(composer.controller.value, draft);
        expect(f.h.chat.state.composerAttachments, attachments);
        final later = attachments.single.copyWith(
          id: 'later-upload',
          name: 'later.txt',
          storagePath: 'synthetic/later.txt',
        );
        if (laterEdit) {
          composer.controller.text = 'Later draft';
          f.h.chat.emit(
            f.h.chat.state.copyWith(
              composerAttachments: [...attachments, later],
            ),
          );
        }
        f.history.complete();
        await sending;
        expect(f.liveRepository.requests, 1);
        expect(f.connections, 1);
        expect(f.wire.textAttempts, 1);
        expect(f.wire.texts.single, contains(_draft));
        expect(f.wire.texts.single, contains('retained.txt'));
        expect(f.wire.texts.single, isNot(contains('Later draft')));
        expect(f.wire.texts.single, isNot(contains('later.txt')));
        expect(f.live.state.status, AssistantLiveConnectionStatus.connected);
        expect(f.live.state.userDraft, _draft);
        expect(composer.controller.text, laterEdit ? 'Later draft' : '');
        expect(
          f.h.chat.state.composerAttachments,
          laterEdit ? [later] : isEmpty,
        );
        expect(f.h.repository.starts, 0);
        expect(
          f.h.chat.state.messages.where((row) => row.role == 'user'),
          isEmpty,
        );
        await tester.pump();
        expect(find.text(_refusedNotice), findsNothing);
        expect(find.text(_unknownNotice), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final boundary in ['token', 'history']) {
    for (final change in [
      'actor',
      'workspace',
      'conversation',
      'same canonical selection',
    ]) {
      testWidgets('Page $change during $boundary retires preparing send', (
        tester,
      ) async {
        final f = await _preparationPage(tester);
        final composer = _composer(tester);
        final sending = composer.onSend();
        await _untilPreparation(tester, () => f.liveRepository.requests == 1);
        expect(f.live.state.status, AssistantLiveConnectionStatus.preparing);
        if (boundary == 'history') {
          f.releaseToken();
          await _untilPreparation(tester, () => f.repository.historyEntered);
        }
        // Binding overlaps the handshake, so a history-boundary departure may
        // retire an opened provider connection; it never carries user text.
        final maxConnections = boundary == 'history' ? 1 : 0;
        _departPreparation(f, change);
        if (boundary == 'token') f.releaseToken();
        f.history.complete();
        await _untilSettled(tester, sending);
        expect(f.live.state.status, AssistantLiveConnectionStatus.disconnected);
        expect(f.connections, lessThanOrEqualTo(maxConnections));
        // A provider wire opened during binding must be closed, not leaked.
        expect(f.wire.sinkCloses, f.connections == 0 ? 0 : greaterThan(0));
        expect(f.wire.textAttempts, 0);
        expect(f.h.repository.starts, 0);
        expect(f.live.state.userDraft, isEmpty);
        expect(find.text(_refusedNotice), findsNothing);
        expect(find.text(_unknownNotice), findsNothing);
        if (change == 'conversation' || change == 'same canonical selection') {
          expect(
            f.h.chat.state.storedChatId,
            change == 'conversation' ? 'other-chat' : _canonicalLiveChat,
          );
          expect(composer.controller.text, _draft);
          expect(
            f.h.chat.state.composerAttachments.single.name,
            'retained.txt',
          );
        }
        await tester.pump(const Duration(seconds: 60));
        expect(f.live.state.status, AssistantLiveConnectionStatus.disconnected);
        expect(f.connections, lessThanOrEqualTo(maxConnections));
        expect(f.wire.textAttempts, 0);
        expect(f.h.repository.starts, 0);
        expect(find.text(_refusedNotice), findsNothing);
        expect(find.text(_unknownNotice), findsNothing);
        expect(tester.takeException(), isNull);
      });
    }
  }

  for (final selected in [_chat, 'legacy-ai-$_chat']) {
    testWidgets('Page binds canonical history for $selected without '
        'carrying the prior selection send across namespaces', (tester) async {
      final f = await _preparationPage(tester, selectedChat: selected);
      final composer = _composer(tester);
      final draft = composer.controller.value;
      final attachments = f.h.chat.state.composerAttachments;
      final restores = f.repository.restoredIds.length;
      final sending = composer.onSend();
      await _untilPreparation(tester, () => f.liveRepository.requests == 1);
      expect(f.live.state.status, AssistantLiveConnectionStatus.preparing);
      f.releaseToken();
      await _untilPreparation(tester, () => f.repository.historyEntered);
      expect(f.repository.restoredIds.length, restores + 1);
      expect(f.repository.restoredIds.last, _canonicalLiveChat);
      expect(f.h.chat.state.storedChatId, selected);
      expect(f.wire.textAttempts, 0);
      f.history.complete();
      await _untilSettled(tester, sending);
      // The overlapped handshake may have opened (then retired) a connection;
      // the prior selection's send never crosses into the bound namespace.
      expect(f.live.state.status, AssistantLiveConnectionStatus.disconnected);
      expect(f.h.chat.state.storedChatId, _canonicalLiveChat);
      expect(f.h.chat.state.chat?.id, _canonicalLiveChat);
      expect(f.connections, lessThanOrEqualTo(1));
      expect(f.wire.sinkCloses, f.connections == 0 ? 0 : greaterThan(0));
      expect(f.wire.textAttempts, 0);
      expect(composer.controller.value, draft);
      expect(f.h.chat.state.composerAttachments, attachments);
      expect(f.h.repository.starts, 0);
      await tester.pump();
      expect(find.text(_refusedNotice), findsNothing);
      expect(find.text(_unknownNotice), findsNothing);
      await tester.pump(const Duration(seconds: 60));
      expect(f.live.state.status, AssistantLiveConnectionStatus.disconnected);
      expect(f.connections, lessThanOrEqualTo(1));
      expect(f.wire.textAttempts, 0);
      expect(f.h.repository.starts, 0);
      expect(find.text(_refusedNotice), findsNothing);
      expect(find.text(_unknownNotice), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }

  for (final change in [
    'current',
    'actor',
    'workspace',
    'conversation',
    'local mode',
  ]) {
    testWidgets('Page observed Live drop keeps recovery in $change scope', (
      tester,
    ) async {
      final wire = LiveDispatchTransport();
      final h = await _mount(tester, transport: wire);
      await _liveDraft(tester, h);
      final live = h.pageContext.read<AssistantLiveCubit>();
      final composer = _composer(tester);
      final draft = composer.controller.value;
      final attachments = h.chat.state.composerAttachments;
      final sending = composer.onSend();
      expect(wire.textAttempts, 0);
      // Deliver transport state before the readiness await resumes.
      wire.closeCode = 1006;
      live.emit(
        live.state.copyWith(status: AssistantLiveConnectionStatus.reconnecting),
      );
      switch (change) {
        case 'current':
          break;
        case 'actor':
          h.auth.change(const AuthState.unauthenticated());
        case 'workspace':
          h.workspace.change('88888888-8888-4888-8888-888888888888');
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
      expect(wire.texts, isEmpty);
      expect(
        wire.admitted.where((frame) => frame.containsKey('realtimeInput')),
        isEmpty,
      );
      expect(h.repository.starts, 0);
      expect(live.state.userDraft, isEmpty);
      expect(h.chat.state.messages.where((row) => row.role == 'user'), isEmpty);
      expect(find.text(_unknownNotice), findsNothing);
      expect(
        find.text(_refusedNotice),
        change == 'current' ? findsOneWidget : findsNothing,
      );
      if (change == 'current') {
        expect(composer.controller.value, draft);
        expect(h.chat.state.composerAttachments, attachments);
        expect(live.state.status, AssistantLiveConnectionStatus.reconnecting);
      }
      await tester.pump(const Duration(seconds: 1));
      expect(wire.textAttempts, 0);
      expect(h.repository.starts, 0);
      expect(find.text(_unknownNotice), findsNothing);
      expect(
        find.text(_refusedNotice),
        change == 'current' ? findsOneWidget : findsNothing,
      );
      expect(tester.takeException(), isNull);
    });
  }

  for (final change in [
    'actor',
    'workspace',
    'conversation',
    'same canonical selection',
  ]) {
    testWidgets(
      'Page $change after sink add fences old cleanup without replay',
      (tester) async {
        final f = await _preparationPage(tester);
        final composer = _composer(tester);
        final draft = composer.controller.value;
        final attachments = f.h.chat.state.composerAttachments;
        final sending = composer.onSend();
        await _untilPreparation(tester, () => f.liveRepository.requests == 1);
        f.releaseToken();
        await _untilPreparation(tester, () => f.repository.historyEntered);
        f.wire.afterText = () {
          expect(f.wire.texts.single, contains(_draft));
          _departPreparation(f, change);
        };
        f.history.complete();
        await sending;
        // Inspect before the departure's own lifecycle rebuild clears old data.
        expect(composer.controller.value, draft);
        expect(f.h.chat.state.composerAttachments, attachments);
        expect(f.live.state.userDraft, isEmpty);
        expect(f.connections, 1);
        expect(f.wire.textAttempts, 1);
        expect(f.h.repository.starts, 0);
        expect(
          f.h.chat.state.messages.where((row) => row.role == 'user'),
          isEmpty,
        );
        await tester.pump();
        expect(find.text(_refusedNotice), findsNothing);
        expect(
          find.text(_unknownNotice),
          change == 'same canonical selection' ? findsOneWidget : findsNothing,
        );
        await tester.pump(const Duration(seconds: 1));
        expect(f.wire.textAttempts, 1);
        if (change == 'same canonical selection') {
          expect(f.h.chat.state.storedChatId, _canonicalLiveChat);
          expect(composer.controller.value, draft);
          expect(f.h.chat.state.composerAttachments, attachments);
          expect(find.text(_unknownNotice), findsOneWidget);
        } else {
          expect(find.text(_unknownNotice), findsNothing);
        }
        expect(find.text(_refusedNotice), findsNothing);
        expect(f.h.repository.starts, 0);
        expect(tester.takeException(), isNull);
      },
    );
  }
}
