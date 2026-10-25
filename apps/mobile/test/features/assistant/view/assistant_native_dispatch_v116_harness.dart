import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_first_message_creation.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_chat_feedback.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_dock.dart';
import 'package:mobile/features/assistant/widgets/assistant_composer_launcher.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mobile/features/chat/models/chat_initial_ai_settings.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'assistant_settings_repair_harness.dart';
import 'background_reply_harness.dart';

class _AuthClient extends Mock implements SupabaseClient {}

class _Auth extends Mock implements GoTrueClient {}

class _Session extends Mock implements Session {}

class _Storage extends Mock implements FlutterSecureStorage {}

class NativeDispatchPort {
  NativeDispatchPort() : _credentialZone = Zone.current {
    when(() => client.auth).thenReturn(auth);
    when(() => auth.currentUser).thenAnswer((_) => user);
    when(() => auth.currentSession).thenReturn(session);
    when(() => session.accessToken).thenAnswer((_) => 'synthetic-$actor');
    when(() => session.expiresAt).thenAnswer(
      (_) => expired
          ? 0
          : DateTime.now()
                    .add(const Duration(hours: 1))
                    .millisecondsSinceEpoch ~/
                1000,
    );
    when(auth.refreshSession).thenAnswer((_) async {
      if (!credentialsEntered.isCompleted) credentialsEntered.complete();
      await credentialsRelease.future;
      expired = false;
      return AuthResponse(session: session, user: user);
    });
    api = ApiClient(
      baseUrl: 'https://fixture.test',
      authClient: client,
      httpClient: MockClient(handle),
    );
  }
  final Zone _credentialZone;
  final client = _AuthClient();
  final auth = _Auth();
  final session = _Session();
  late final ApiClient api;
  String actor = repairActor;
  bool expired = false;
  bool armCredentials = false;
  bool holdConnectivity = false;
  bool offline = false;
  bool loseFirstReceipt = false;
  bool foreignRetry = false;
  Error? postFailure;
  int responseStatus = 201;
  Completer<void> credentialsEntered = Completer<void>();
  Completer<void> credentialsRelease = Completer<void>();
  final connectivityEntered = Completer<void>();
  final connectivityRelease = Completer<void>();
  Completer<void>? responseGate;
  Completer<void> postEntered = Completer<void>();
  final settingsReads = <String>[];
  final creates = <Map<String, dynamic>>[];
  Map<String, dynamic>? initialSettings;
  final posts = <Map<String, dynamic>>[];
  final authorizations = <String?>[];
  final saved = <String, Map<String, dynamic>>{};
  User get user => User(
    id: actor,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '2026-01-01',
  );

  Future<List<ConnectivityResult>> connectivity() async {
    if (holdConnectivity) {
      holdConnectivity = false;
      if (!connectivityEntered.isCompleted) connectivityEntered.complete();
      await connectivityRelease.future;
    }
    return [if (offline) ConnectivityResult.none else ConnectivityResult.wifi];
  }

  Future<http.Response> handle(http.Request request) async {
    final path = request.url.path;
    if (request.method == 'POST' && path.endsWith('/conversations')) {
      final body = Map<String, dynamic>.from(jsonDecode(request.body) as Map);
      creates.add(body);
      initialSettings = Map<String, dynamic>.from(
        body['initialAiSettings'] as Map,
      );
      return http.Response(
        jsonEncode({
          'conversation': {
            'id': repairChat,
            'wsId': repairWorkspace,
            'createdBy': actor,
            'type': 'ai',
            'createdAt': '2026-10-18T00:00:00.123456Z',
            'initialAiSettings': {
              ...initialSettings!,
              'actorUserId': actor,
              'wsId': repairWorkspace,
              'conversationId': repairChat,
            },
          },
        }),
        201,
      );
    }
    if (path.endsWith('/ai-settings')) {
      settingsReads.add(actor);
      if (armCredentials) {
        armCredentials = false;
        expired = true;
      }
      return http.Response(
        jsonEncode({
          'settings': {
            'conversationId': repairChat,
            'modelId': 'synthetic/model-a',
            'creditSource': 'workspace',
            'creditWsId': null,
            'thinkingMode': 'fast',
            ...?initialSettings,
          },
        }),
        200,
      );
    }
    if (request.method == 'GET' && path.endsWith('/messages')) {
      return http.Response(
        jsonEncode({'messages': saved.values.toList()}),
        200,
      );
    }
    if (request.method == 'POST' && path.endsWith('/messages')) {
      final body = Map<String, dynamic>.from(jsonDecode(request.body) as Map);
      final first = body['initialConversation'] as Map<String, dynamic>?;
      final conversationId = request.url.pathSegments[6];
      if (first != null) initialSettings = {...first};
      posts.add(body);
      authorizations.add(request.headers['authorization']);
      if (!postEntered.isCompleted) postEntered.complete();
      final id = body['clientRequestId'] as String;
      final row = saved.putIfAbsent(
        id,
        () => {
          'id':
              '77777777-7777-4777-8777-'
              '${saved.length.toString().padLeft(12, '0')}',
          'conversationId': conversationId,
          'senderId': actor,
          'kind': 'user',
          'content': body['content'],
          'createdAt': '2026-10-18T00:00:00.123456Z',
          'metadata': {'clientRequestId': id},
          'attachments': body['attachments'],
        },
      );
      final failure = postFailure;
      if (failure != null) throw failure;
      await responseGate?.future;
      if (responseStatus != 201) {
        return http.Response(
          '{}',
          responseStatus,
          headers: responseStatus == 403
              ? {'x-abuse-challenge': 'turnstile'}
              : {},
        );
      }
      if (loseFirstReceipt && posts.length == 1) {
        return http.Response(
          '',
          201,
          headers: {'content-type': 'application/x-ndjson'},
        );
      }
      final receipt = {
        ...row,
        if (foreignRetry && posts.length > 1)
          'senderId': '99999999-9999-4999-8999-999999999999',
      };
      final assistant = {
        ...row,
        'id':
            '88888888-8888-4888-8888-'
            '${posts.length.toString().padLeft(12, '0')}',
        'senderId': null,
        'kind': 'assistant',
        'content': 'Synthetic reply',
        'metadata': <String, dynamic>{},
        'attachments': <dynamic>[],
      };
      final events = [
        {'type': 'message', 'message': receipt},
        {
          'type': 'messages',
          'messages': [assistant],
        },
        {'type': 'done'},
      ];
      return http.Response(
        '${events.map(jsonEncode).join('\n')}\n',
        201,
        headers: {
          'content-type': 'application/x-ndjson',
          if (first != null)
            'x-mira-chat-creation': base64Url.encode(
              utf8.encode(
                jsonEncode({
                  'creationRequestId': id,
                  'conversation': {
                    'id': conversationId,
                    'wsId': repairWorkspace,
                    'createdBy': actor,
                    'type': 'ai',
                    'createdAt': '2026-10-18T00:00:00.123456Z',
                    'creationRequestId': id,
                    'initialAiSettings': {
                      ...first,
                      'actorUserId': actor,
                      'wsId': repairWorkspace,
                      'conversationId': conversationId,
                    },
                  },
                }),
              ),
            ),
        },
      );
    }
    return http.Response('{}', 404);
  }

  void holdHeaders() {
    armCredentials = true;
    credentialsEntered = _credentialZone.run(Completer<void>.new);
    credentialsRelease = _credentialZone.run(Completer<void>.new);
  }

  void release() {
    if (!credentialsRelease.isCompleted) credentialsRelease.complete();
    if (!connectivityRelease.isCompleted) connectivityRelease.complete();
    final gate = responseGate;
    if (gate != null && !gate.isCompleted) gate.complete();
  }
}

class NativeDispatchRepository extends ReplyRepository {
  NativeDispatchRepository(this.port, this.queue, this.store)
    : super(apiClient: port.api);
  final NativeDispatchPort port;
  final OfflineMutationQueue queue;
  final CacheStore store;
  Object? lastFailure;
  Object? substituteFailure;
  @override
  String? get currentActorId => port.actor;
  late final AssistantRepository real = AssistantRepository(
    apiClient: port.api,
    currentUserId: () => port.actor,
    chatCacheStore: store,
    chatRepository: ChatRepository(apiClient: port.api, mutationQueue: queue),
  );
  @override
  Future<AssistantChatRecord> createChat({
    required String id,
    required String wsId,
    required String modelId,
    required String message,
    required String timezone,
    ChatInitialAiSettings? initialSettings,
    bool Function()? isCurrent,
  }) => real.createChat(
    id: id,
    wsId: wsId,
    modelId: modelId,
    message: message,
    timezone: timezone,
    initialSettings: initialSettings,
    isCurrent: isCurrent,
  );
  @override
  Stream<AssistantStreamEvent> streamFirstChat({
    required AssistantFirstMessageCreation creation,
    required String chatId,
    required String wsId,
    required List<AssistantMessage> messages,
    required String timezone,
    required ApiMutationAdmission admission,
  }) => real
      .streamFirstChat(
        creation: creation,
        chatId: chatId,
        wsId: wsId,
        messages: messages,
        timezone: timezone,
        admission: admission,
      )
      .handleError((Object error, StackTrace stack) {
        lastFailure = error;
        Error.throwWithStackTrace(substituteFailure ?? error, stack);
      });
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) => real.restoreChat(
    wsId: wsId,
    chatId: chatId,
    forceRefresh: true,
    cacheOrigin: cacheOrigin,
  );
  @override
  Stream<AssistantStreamEvent> streamChat({
    required String chatId,
    required String wsId,
    required String? workspaceContextId,
    required String modelId,
    required List<AssistantMessage> messages,
    required AssistantThinkingMode thinkingMode,
    required AssistantCreditSource creditSource,
    required String timezone,
    List<AssistantAttachment> attachments = const [],
    String? creditWsId,
    ApiMutationAdmission? admission,
  }) => real
      .streamChat(
        chatId: chatId,
        wsId: wsId,
        workspaceContextId: workspaceContextId,
        modelId: modelId,
        messages: messages,
        thinkingMode: thinkingMode,
        creditSource: creditSource,
        timezone: timezone,
        attachments: attachments,
        creditWsId: creditWsId,
        admission: admission,
      )
      .handleError((Object error, StackTrace stack) {
        lastFailure = error;
        Error.throwWithStackTrace(substituteFailure ?? error, stack);
      });
  @override
  Future<List<AssistantGatewayModel>> fetchGatewayModels({
    bool forceRefresh = false,
  }) async => const [
    AssistantGatewayModel(
      value: 'synthetic/model-a',
      label: 'A',
      provider: 'synthetic',
    ),
  ];
  @override
  Future<AssistantAttachment> uploadAttachment({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
    void Function(double progress)? onProgress,
  }) async => AssistantAttachment(
    id: file.id,
    name: file.name,
    size: file.size,
    type: file.mimeType,
    storagePath: 'chats/$chatId/${file.name}',
    uploadState: AssistantAttachmentUploadState.uploaded,
  );
}

class _RealAsyncNativeQueue extends OfflineMutationQueue {
  _RealAsyncNativeQueue(NativeDispatchPort port, CacheStore store)
    : _ioZone = Zone.current,
      super.forTesting(
        store: store,
        userId: () => port.actor,
        checkConnectivity: port.connectivity,
        connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
        authChanges: const Stream<AuthState>.empty(),
        apiFactory: (_) => port.api,
      );

  final Zone _ioZone;

  @override
  Future<void> enqueue(
    PendingMutationRecord record, {
    void Function()? checkScope,
  }) => _ioZone.run(() => super.enqueue(record, checkScope: checkScope));
}

class NativeDispatchHarness extends BackgroundReplyHarness {
  NativeDispatchHarness._(this.port, this.queue, this.store, this.directory)
    : super(repository: NativeDispatchRepository(port, queue, store));
  final NativeDispatchPort port;
  final OfflineMutationQueue queue;
  final CacheStore store;
  final Directory directory;
  void Function(String stage)? disposeProgress;
  static Future<NativeDispatchHarness> create({
    bool realAsyncQueuedWrites = false,
  }) async {
    final port = NativeDispatchPort();
    final directory = await Directory.systemTemp.createTemp('pr6277-v116-');
    final storage = _Storage();
    final secrets = <String, String>{};
    when(() => storage.read(key: any(named: 'key')))
        .thenAnswer((i) async => secrets[i.namedArguments[#key] as String]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((i) async {
      secrets[i.namedArguments[#key] as String] =
          i.namedArguments[#value] as String;
    });
    final store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    final queue = realAsyncQueuedWrites
        ? _RealAsyncNativeQueue(port, store)
        : OfflineMutationQueue.forTesting(
            store: store,
            userId: () => port.actor,
            checkConnectivity: port.connectivity,
            connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
            authChanges: const Stream<AuthState>.empty(),
            apiFactory: (_) => port.api,
          );
    await queue.init();
    return NativeDispatchHarness._(port, queue, store, directory);
  }

  Future<void> openComposer(WidgetTester tester) async {
    final launcher = find.byType(AssistantComposerFab);
    if (launcher.evaluate().isNotEmpty) {
      expect(launcher.hitTestable(), findsOneWidget);
      await tester.tap(launcher);
      expect(chrome.state.composerVisible, isTrue);
      await tester.pump();
      expect(dock.slot?.composing, isTrue);
      await tester.pump();
    }
    expect(find.byType(AssistantComposerDock), findsOneWidget);
  }

  TextEditingController draft(WidgetTester tester) => tester
      .widget<AssistantComposerDock>(find.byType(AssistantComposerDock))
      .controller;
  Future<void> settle(WidgetTester tester) async {
    for (var i = 0; i < 12; i++) {
      await tester.pump(const Duration(milliseconds: 100));
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 10)),
      );
    }
  }

  Future<void> open(WidgetTester tester) async {
    await mount(tester);
    await tester.runAsync(() => chat.openChatById(repairWorkspace, repairChat));
    await tester.pumpAndSettle();
  }

  Future<void> prepareNewConversation(WidgetTester tester) async {
    final actor = port.actor;
    final reset = AssistantResetPreferences(
      actorId: actor,
      workspaceId: repairWorkspace,
      isCurrent: () =>
          port.actor == actor && chat.state.workspaceId == repairWorkspace,
    );
    if (await tester.runAsync(reset.hasUnknownCreation) == false) {
      expect(port.creates, isEmpty);
      expect(port.posts, isEmpty);
      return;
    }
    actions.state
        .resolveForLocation('/assistant')
        .singleWhere((action) => action.id == 'assistant-more')
        .onPressed!();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Recent chats'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('New conversation'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(AppButton, 'Start a new chat'));
    await tester.pumpAndSettle();
    expect(await tester.runAsync(reset.hasUnknownCreation), isFalse);
    expect(port.creates, isEmpty);
    expect(port.posts, isEmpty);
  }

  Future<void> pageSend(WidgetTester tester, String text) async {
    if (find.byType(AssistantComposerFab).evaluate().isNotEmpty) {
      await tester.tap(find.byType(AssistantComposerFab));
      await tester.pumpAndSettle();
    }
    draft(tester).text = text;
    await tester.pump();
    await tester.tap(find.byKey(const ValueKey('assistant-navigation-toggle')));
    await settle(tester);
  }

  Future<void> retry(WidgetTester tester) async {
    final feedback = tester.widget<AssistantChatFeedback>(
      find.byType(AssistantChatFeedback),
    );
    expect(feedback.onRetry, isNotNull);
    feedback.onRetry!();
    await settle(tester);
  }

  Future<void> attach(WidgetTester tester, String name) => tester.runAsync(
    () => chat.addComposerAttachments(
      wsId: repairWorkspace,
      files: [
        AssistantMemoryFile(name: name, bytes: Uint8List.fromList([1, 2, 3])),
      ],
      modelId: 'synthetic/model-a',
      timezone: 'UTC',
    ),
  );
  @override
  Future<void> dispose(WidgetTester tester) async {
    disposeProgress?.call('release-before');
    port.release();
    disposeProgress?.call('release-after');
    disposeProgress?.call('widgets-before');
    await super.dispose(tester);
    disposeProgress?.call('widgets-after');
    disposeProgress?.call('queue-before');
    await queue.dispose();
    disposeProgress?.call('queue-after');
    disposeProgress?.call('store-before');
    await store.closeForTesting(onStage: disposeProgress);
    disposeProgress?.call('store-after');
    disposeProgress?.call('api-before');
    port.api.dispose();
    disposeProgress?.call('api-after');
    disposeProgress?.call('directory-before');
    await directory.delete(recursive: true);
    disposeProgress?.call('directory-after');
  }
}
