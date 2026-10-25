part of 'assistant_live_keyboard_startup_test.dart';

const _actor = '33333333-3333-4333-8333-333333333333';
const _workspace = '22222222-2222-4222-8222-222222222222';

class _Repository extends ReplyRepository {
  @override
  Future<AssistantCredits> fetchCredits(
    String wsId, {
    bool forceRefresh = false,
  }) async => const AssistantCredits(remaining: 1000, tier: 'PRO');
}

class _RecordingPlatform extends RecordPlatform {
  final permissions = <Completer<bool>>[];
  bool grantFirstPermission = true;
  bool recording = false;
  int captures = 0;

  @override
  Future<void> create(String recorderId) async {}
  @override
  Stream<RecordState> onStateChanged(String recorderId) => const Stream.empty();
  @override
  Future<bool> hasPermission(String recorderId, {bool request = true}) {
    final permission = Completer<bool>();
    permissions.add(permission);
    if (grantFirstPermission && permissions.length == 1) {
      permission.complete(true);
    }
    return permission.future;
  }

  @override
  Future<Stream<Uint8List>> startStream(
    String recorderId,
    RecordConfig config,
  ) async {
    captures++;
    recording = true;
    return const Stream.empty();
  }

  @override
  Future<bool> isRecording(String recorderId) async => recording;
  @override
  Future<Amplitude> getAmplitude(String recorderId) async =>
      Amplitude(current: -160, max: -160);
  @override
  Future<String?> stop(String recorderId) async {
    recording = false;
    return null;
  }

  @override
  Future<void> dispose(String recorderId) async {}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _HeldTokens extends AssistantLiveRepository {
  final requests = <Completer<AssistantLiveTokenEnvelope>>[];
  final _entries = <int, Completer<void>>{};

  Future<void> entered(int count) {
    if (requests.length >= count) return Future<void>.value();
    return _entries.putIfAbsent(count, Completer<void>.new).future;
  }

  @override
  Future<AssistantLiveTokenEnvelope> fetchLiveToken({
    required String wsId,
    String? chatId,
    String? model,
    bool forceFresh = false,
  }) {
    final request = Completer<AssistantLiveTokenEnvelope>();
    requests.add(request);
    _entries.remove(requests.length)?.complete();
    return request.future;
  }

  void release(int index) => requests[index].complete(
    const AssistantLiveTokenEnvelope(
      token: 'synthetic-never-connect',
      chatId: 'chat',
      scopeKey: 'scope',
      sessionHandle: null,
      model: 'model',
      seedHistory: [],
    ),
  );
}

/// Keeps the real portal and controls, observing only their original Futures.
class _LiveDockProbe extends ShellDockSlotController {
  final actions = <String, List<Future<void>>>{
    'microphone': [],
    'keyboard': [],
    'exit': [],
  };

  Future<void> _record(String control, Future<void> Function() callback) {
    final operation = callback();
    actions[control]!.add(operation);
    return operation;
  }

  @override
  void publish(Object owner, ShellDockSlot slot) {
    final content = slot.content;
    if (content is! AssistantLiveCallControls) {
      super.publish(owner, slot);
      return;
    }
    super.publish(
      owner,
      ShellDockSlot(
        location: slot.location,
        workspaceId: slot.workspaceId,
        composing: slot.composing,
        expandContent: slot.expandContent,
        primary: slot.primary,
        content: AssistantLiveCallControls(
          key: content.key,
          state: content.state,
          onMicrophone: () => _record('microphone', content.onMicrophone),
          onCamera: content.onCamera,
          onText: () => _record('keyboard', content.onText),
          onDisconnect: () => _record('exit', content.onDisconnect),
        ),
      ),
    );
  }
}

class _KeyboardHarness {
  final auth = ReplyAuth();
  final workspace = ReplyWorkspace();
  final repository = _Repository();
  final tokens = _HeldTokens();
  final chrome = AssistantChromeCubit();
  final actions = ShellChromeActionsCubit();
  final dock = _LiveDockProbe();
  final recorder = _RecordingPlatform();
  List<Completer<bool>> get permissions => recorder.permissions;
  late RecordPlatform previousRecorder;
  late AssistantLiveCubit live;

  Future<void> mount(
    WidgetTester tester, {
    bool retain = false,
    bool grantFirstPermission = true,
  }) async {
    recorder.grantFirstPermission = grantFirstPermission;
    previousRecorder = RecordPlatform.instance;
    RecordPlatform.instance = recorder;
    SharedPreferences.setMockInitialValues({
      '$_actor::$assistantKeepLiveWhileBrowsingKeyPrefix$_workspace': retain,
    });
    tester.binding.defaultBinaryMessenger
      ..setMockMethodCallHandler(
        const MethodChannel('flutter_timezone'),
        (_) async => 'UTC',
      )
      ..setMockMethodCallHandler(
        const MethodChannel('flutter_pcm_sound/methods'),
        (_) async => true,
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
              liveRepository: tokens,
              preferences: AssistantPreferences(
                currentUserId: () => auth.state.user?.id,
              ),
              currentActor: () => auth.state.user?.id,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(AssistantComposerFab));
    await tester.pumpAndSettle();
    live = tester
        .element(find.byType(ShellDockPublisher))
        .read<AssistantLiveCubit>();
    await reopen(tester);
  }

  Future<void> reopen(WidgetTester tester) async {
    chrome.enterLiveMode();
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> startMicrophone(WidgetTester tester) => tap(
    tester,
    'microphone',
    entering: tokens.entered(tokens.requests.length + 1),
  );

  Future<void> tap(
    WidgetTester tester,
    String control, {
    Future<void>? entering,
    bool completes = false,
  }) async {
    final operations = dock.actions[control]!;
    final previous = operations.length;
    await tester.tap(find.byKey(ValueKey('live-control-$control')));
    expect(
      operations,
      hasLength(previous + 1),
      reason: 'The actual navbar must invoke its original $control callback.',
    );
    if (entering != null) {
      await driveLiveStartupFuture(
        tester,
        entering,
        reason: 'The navbar start must enter its own held token request.',
      );
    }
    if (completes) {
      await driveLiveStartupFuture(
        tester,
        operations.last,
        reason: 'The navbar $control callback must finish before assertions.',
      );
    }
    await tester.pump();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> retry(WidgetTester tester) async {
    final entering = tokens.entered(tokens.requests.length + 1);
    final l10n = tester.element(find.byType(AssistantPage)).l10n;
    await tester.tap(find.text(l10n.assistantLiveRetryAction));
    await driveLiveStartupFuture(
      tester,
      entering,
      reason: 'Inline Retry must enter its own held token request.',
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400));
  }

  Future<void> renderLiveStatus(
    WidgetTester tester,
    AssistantLiveConnectionStatus status,
  ) async {
    await tester.pump();
    expect(live.state.status, status);
    if (status == AssistantLiveConnectionStatus.error) {
      await driveLiveStartupFuture(
        tester,
        dock.actions['microphone']!.last,
        reason: 'The failed page start must release ownership before retry.',
      );
    }
    // The page publishes after its frame; the shell consumes the next frame.
    await tester.pump();
    final published = dock.slot!.content as AssistantLiveCallControls;
    expect(published.state.status, status);
    await tester.pump();
    final rendered = tester.widget<AssistantLiveCallControls>(
      find.byType(AssistantLiveCallControls),
    );
    expect(rendered.state, same(published.state));
  }

  Future<void> dispose(WidgetTester tester) async {
    final disconnecting = live.disconnect();
    for (final permission in permissions) {
      if (!permission.isCompleted) permission.complete(false);
    }
    await tester.pump();
    await drainLiveFixtureCleanup(tester, disconnecting);
    for (var i = 0; i < tokens.requests.length; i++) {
      if (!tokens.requests[i].isCompleted) tokens.release(i);
    }
    await tester.pump(const Duration(seconds: 20));
    await tester.pump();
    await drainLiveFixtureCleanup(tester, live.close());
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump();
    unawaited(repository.stream.close());
    unawaited(repository.replacement.close());
    for (final channel in ['flutter_timezone', 'flutter_pcm_sound/methods']) {
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        MethodChannel(channel),
        null,
      );
    }
    await drainLiveFixtureCleanup(tester, () async {
      await auth.close();
      await workspace.close();
      await chrome.close();
      await actions.close();
    }());
    dock.dispose();
    RecordPlatform.instance = previousRecorder;
  }
}
