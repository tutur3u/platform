part of 'assistant_new_chat_reset_test.dart';

Future<_ResetHarness> _mount(
  WidgetTester tester, {
  bool held = true,
  _CleanupApi? api,
}) async {
  final h = _ResetHarness(held: held, liveRepository: api?.repository);
  addTearDown(() => h.dispose(tester));
  await h.mount(tester);
  return h;
}

class _ResetRepository extends ReplyRepository {
  _ResetRepository(this.preferences);
  final AssistantPreferences preferences;
  @override
  String? get currentActorId => _actor;
  @override
  Future<bool> hasUnknownChatCreation(String wsId) async =>
      await preferences.resetStore(wsId).hasUnknownCreation();
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => AssistantRestoredChat(
    chat: AssistantChatRecord(id: chatId, title: 'Synthetic history'),
    messages: const [],
    attachmentsByMessageId: const {},
  );
  @override
  Future<AssistantAttachment> uploadAttachment({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
    void Function(double progress)? onProgress,
  }) async => throw const FormatException('Synthetic upload error retained');
}

class _ResetHost extends InMemorySharedPreferencesStore {
  _ResetHost({bool held = true})
    : super.withData({
        'flutter.$_envelopeKey': jsonEncode(_record(held: held)),
      });
  static Map<String, Object?> _record({int revision = 1, bool held = true}) => {
    'schema': 1,
    'actorId': _actor,
    'workspaceId': _workspace,
    'revision': revision,
    'generation': revision,
    'selectedChatId': _saved,
    'contextId': 'prior',
    'creation': {'status': held ? 'unknown' : 'clear', 'attemptId': null},
    'resetConsent': null,
    'resetIntent': null,
  };
  int writes = 0;
  int? holdAt;
  int? faultAt;
  bool throws = false;
  bool unreadable = false;
  @override
  Future<Map<String, Object>> getAll() async {
    if (unreadable) throw const FormatException('Unreadable fixture');
    return await super.getAll();
  }

  final entered = Completer<void>();
  final release = Completer<void>();
  @override
  Future<bool> setValue(String type, String key, Object value) async {
    if (key == 'flutter.$_envelopeKey') {
      writes++;
      if (writes == holdAt) {
        entered.complete();
        await release.future;
      }
      if (writes == faultAt) {
        if (throws) throw StateError('Synthetic held host failure');
        return false;
      }
    }
    return await super.setValue(type, key, value);
  }

  Future<void> replaceHeldRecord({int revision = 2}) async {
    await super.setValue(
      'String',
      'flutter.$_envelopeKey',
      jsonEncode(_record(revision: revision)),
    );
  }
}

class _CleanupApi extends ApiClient {
  _CleanupApi({this.hold = false, this.fail = false});
  AssistantLiveRepository get repository =>
      AssistantLiveRepository(apiClient: this);
  final bool fail;
  final bool hold;
  final release = Completer<void>();
  bool entered = false;
  int posts = 0;
  final deletes = <String>[];
  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    expect(path, '/api/v1/assistant/live/token');
    posts++;
    return {
      'token': 'synthetic-never-connect',
      'chatId': _saved,
      'scopeKey': 'synthetic-scope',
      'model': 'synthetic-model',
      'sessionHandle': 'synthetic-handle',
    };
  }

  @override
  Future<Map<String, dynamic>> deleteJson(
    String path, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
  }) async {
    deletes.add(path);
    entered = true;
    if (hold) await release.future;
    if (fail) {
      throw const ApiException(message: 'private fixture', statusCode: 500);
    }
    return {};
  }
}

class _ResetHarness {
  _ResetHarness({this.held = true, this.liveRepository});
  final AssistantLiveRepository? liveRepository;
  final bool held;
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  late final preferences = AssistantPreferences(
    currentUserId: () => auth.state.user?.id,
  );
  late final repository = _ResetRepository(preferences);
  late final host = _ResetHost(held: held);
  final chrome = AssistantChromeCubit();
  final actions = ShellChromeActionsCubit();
  final dock = ShellDockSlotController();
  late AssistantChatCubit chat;
  late TextEditingController controller;
  Completer<void>? lockRelease;
  Future<void>? lockWork;
  bool lockCompleted = false;
  Future<void> mount(WidgetTester tester) async {
    SharedPreferences.resetStatic();
    SharedPreferencesStorePlatform.instance = host;
    AssistantResetPreferences.revokeConsent(_envelopeKey);
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      (_) async => 'UTC',
    );
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider.value(value: chrome),
          BlocProvider.value(value: actions),
        ],
        child: ShellDockScope(
          controller: dock,
          child: FloatingShellDock(
            location: '/assistant',
            bottomInset: 68,
            navigation: const SizedBox(height: 52),
            child: AssistantPage(
              repository: repository,
              liveRepository: liveRepository,
              preferences: preferences,
              currentActor: () => auth.state.user?.id,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(AssistantComposerFab));
    await tester.pumpAndSettle();
    chat = tester
        .element(find.byType(ShellDockPublisher))
        .read<AssistantChatCubit>();
    controller = tester
        .widget<AssistantComposerDock>(find.byType(AssistantComposerDock))
        .controller;
    controller.value = const TextEditingValue(
      text: 'Synthetic preserved draft',
      selection: TextSelection(baseOffset: 3, extentOffset: 12),
    );
    await tester.runAsync(
      () => chat.addComposerAttachments(
        wsId: _workspace,
        files: [
          GalleryPlatformFile(
            XFile.fromData(Uint8List(3), name: 'fixture.txt'),
          ),
        ],
        modelId: 'synthetic-model',
        timezone: 'UTC',
      ),
    );
    await tester.pumpAndSettle();
    expect(chat.state.creationOutcomeUnknown, held);
    expect(chat.state.composerAttachments, hasLength(1));
  }

  Future<void> openHistory(WidgetTester tester) async {
    actions.state
        .resolveForLocation('/assistant')
        .singleWhere((a) => a.id == 'assistant-more')
        .onPressed!();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Recent chats'));
    await tester.pumpAndSettle();
    expect(find.byType(AssistantHistorySheetBody), findsOneWidget);
  }

  Future<void> begin(WidgetTester tester) async {
    await tester.tap(find.byTooltip('New conversation'));
    await tester.pumpAndSettle();
  }

  Future<void> confirm(WidgetTester tester) async {
    await tester.tap(find.widgetWithText(AppButton, 'Start a new chat'));
    await tester.pumpAndSettle();
  }

  Future<void> selectHistory(WidgetTester tester, String id) async {
    final finder = find.byType(AssistantHistorySheetBody);
    final body = tester.widget<AssistantHistorySheetBody>(finder);
    final selecting = body.onSelectChat(AssistantChatRecord(id: id));
    await tester.pumpAndSettle();
    await selecting;
  }

  Future<void> dispose(WidgetTester tester) async {
    if (lockRelease case final gate? when !gate.isCompleted) gate.complete();
    await lockWork;
    if (!host.release.isCompleted) host.release.complete();
    host.unreadable = false;
    unawaited(repository.stream.close());
    unawaited(repository.replacement.close());
    if (find.byType(AppDialog).evaluate().isNotEmpty) {
      Navigator.of(tester.element(find.byType(AppDialog))).pop();
      await tester.pumpAndSettle();
    }
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    for (final channel in [
      'flutter_timezone',
      'com.llfbandit.record/messages',
    ]) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        MethodChannel(channel),
        null,
      );
    }
    await auth.close();
    await workspace.close();
    await chrome.close();
    await actions.close();
    dock.dispose();
  }
}
