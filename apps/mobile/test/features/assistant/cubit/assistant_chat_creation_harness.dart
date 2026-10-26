import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_reset_preferences.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_platform_interface.dart';

const ws = '11111111-1111-4111-8111-111111111111';
const otherWs = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const otherActor = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const saved = '44444444-4444-4444-8444-444444444444';

class CreationApi extends Mock implements ApiClient {
  String? nativeActor;
  int nativeCalls = 0;
  @override
  Future<http.StreamedResponse> sendJsonStreamAcknowledged(
    String method,
    String path,
    Object? body, {
    required ApiMutationAdmission admission,
    String accept = 'application/octet-stream',
  }) {
    admission.recordDispatchPossible();
    nativeActor = admission.actorId;
    nativeCalls++;
    return sendJsonStream(method, path, body, accept: accept);
  }

  @override
  Future<Map<String, dynamic>> postJsonAcknowledged(
    String path,
    Map<String, dynamic> body, {
    required String actorId,
    required bool Function() isCurrent,
  }) {
    if (!isCurrent()) throw StateError('Synthetic retired creation');
    return postJson(path, body);
  }
}

class CreationActor {
  String _id = actorId;
  void Function()? onRead;
  String get id {
    final snapshot = _id;
    onRead?.call();
    return snapshot;
  }

  set id(String value) => _id = value;
}

// Creation, marker persistence, settings and USER NDJSON use real repository
// code with a synthetic HTTP adapter. Upload records scope without storage I/O.
// This proves no authenticated network, provider, device or customer behavior.
class CreationRepository extends AssistantRepository {
  CreationRepository(
    CreationApi api,
    CreationActor actor, {
    this.nativeRestore = false,
  }) : super(
         apiClient: api,
         tasksApiClient: api,
         chatRepository: ChatRepository(apiClient: api),
         currentUserId: () => actor.id,
       );
  final bool nativeRestore;
  final uploads = <String>[];
  int ids = 0;
  @override
  String generateUuid() =>
      'aaaaaaaa-aaaa-4aaa-8aaa-${(++ids).toString().padLeft(12, '0')}';
  @override
  Future<List<AssistantChatRecord>> fetchRecentChats({
    String? wsId,
    int? limit,
    bool forceRefresh = false,
  }) async => [];
  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => nativeRestore
      ? await super.restoreChat(
          wsId: wsId,
          chatId: chatId,
          forceRefresh: forceRefresh,
          cacheOrigin: cacheOrigin,
        )
      : null;
  @override
  Future<AssistantAttachment> uploadAttachment({
    required String wsId,
    required AssistantFilePickerResult file,
    String? chatId,
    void Function(double progress)? onProgress,
  }) async {
    uploads.add(chatId!);
    return AssistantAttachment(
      id: file.id,
      name: file.name,
      size: file.size,
      type: file.mimeType,
      storagePath: 'chats/$chatId/${file.name}',
      uploadState: AssistantAttachmentUploadState.uploaded,
    );
  }
}

class CreationHarness {
  CreationHarness({this.nativeRestore = false, this.hostStore});
  final bool nativeRestore;
  final SharedPreferencesStorePlatform? hostStore;
  Future<void>? historyGate;
  final historyEntered = Completer<void>();
  late CreationApi api;
  late CreationActor actor;
  late CreationRepository repository;
  late AssistantChatCubit chat;
  late Completer<Map<String, dynamic>> response;
  late Completer<void> started;
  late List<Map<String, dynamic>> sends;
  int posts = 0;
  Map<String, dynamic> receipt() => {
    'conversation': {
      'id': saved,
      'wsId': ws,
      'type': 'ai',
      'createdAt': '2026-10-12T00:00:00Z',
    },
  };
  Future<void> setup() async {
    if (hostStore == null) {
      SharedPreferences.setMockInitialValues({});
    } else {
      SharedPreferences.resetStatic();
      SharedPreferencesStorePlatform.instance = hostStore!;
    }
    api = CreationApi();
    actor = CreationActor();
    repository = CreationRepository(api, actor, nativeRestore: nativeRestore);
    final fixturePrefs = await SharedPreferences.getInstance();
    for (final scope in [
      (actorId, ws),
      (actorId, otherWs),
      (otherActor, otherWs),
    ]) {
      // Explicit synthetic confirmed records; legacy clear is never adopted.
      await fixturePrefs.setString(
        '${scope.$1}::mira-conversation-envelope::v1::${scope.$2}',
        jsonEncode({
          'schema': 1,
          'actorId': scope.$1,
          'workspaceId': scope.$2,
          'revision': 1,
          'generation': 1,
          'selectedChatId': null,
          'contextId': ws,
          'creation': {'status': 'clear', 'attemptId': null},
          'resetConsent': null,
          'resetIntent': null,
        }),
      );
    }
    response = Completer<Map<String, dynamic>>();
    started = Completer<void>();
    sends = [];
    posts = 0;
    when(() => api.postJson(any(), any())).thenAnswer((_) async {
      posts++;
      if (posts == 1) {
        started.complete();
        return await response.future;
      }
      return {
        'conversation': {
          ...receipt()['conversation'] as Map<String, dynamic>,
          'id': 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
        },
      };
    });
    when(() => api.getJson(any())).thenAnswer((invocation) async {
      final path = invocation.positionalArguments[0] as String;
      if (nativeRestore && path.contains('/messages')) {
        final gate = historyGate;
        if (gate != null) {
          if (!historyEntered.isCompleted) historyEntered.complete();
          await gate;
        }
        final conversation = path
            .split('/conversations/')
            .last
            .split('/')
            .first;
        return {
          'messages': [
            {
              'id': '99999999-9999-4999-8999-999999999999',
              'conversationId': conversation,
              'kind': 'assistant',
              'content': 'Known history',
              'metadata': <String, dynamic>{},
              'createdAt': '2026-10-12T00:00:00Z',
            },
          ],
        };
      }

      return {
        'settings': {
          'conversationId': path.split('/').reversed.skip(1).first,
          'modelId': 'model',
          'thinkingMode': 'thinking',
          'creditSource': 'workspace',
          'creditWsId': null,
        },
      };
    });
    when(
      () => api.sendJsonStream(
        'POST',
        any(),
        any(),
        accept: 'application/x-ndjson',
      ),
    ).thenAnswer((invocation) async {
      final path = invocation.positionalArguments[1] as String;
      final body = invocation.positionalArguments[2] as Map<String, dynamic>;
      final conversation = path.split('/').reversed.skip(1).first;
      final sender = api.nativeActor ?? actorId;
      sends.add({...body, 'conversationId': conversation});
      final suffix = sends.length.toString().padLeft(12, '0');
      final user = {
        'id': 'cccccccc-cccc-4ccc-8ccc-$suffix',
        'conversationId': conversation,
        'kind': 'user',
        'senderId': sender,
        'attachments': body['attachments'],
        'content': body['content'],
        'createdAt': '2026-10-12T00:00:00Z',
        'metadata': {'clientRequestId': body['clientRequestId']},
      };
      final reply = {
        ...user,
        'id': 'dddddddd-dddd-4ddd-8ddd-$suffix',
        'kind': 'assistant',
        'content': 'Synthetic reply',
        'metadata': <String, dynamic>{},
      };
      final lines = [
        jsonEncode({'type': 'message', 'message': user}),
        jsonEncode({
          'type': 'messages',
          'messages': [reply],
        }),
        jsonEncode({'type': 'done'}),
      ].join('\n');
      return http.StreamedResponse(
        Stream.value(utf8.encode('$lines\n')),
        201,
        headers: {'content-type': 'application/x-ndjson'},
      );
    });
    chat = AssistantChatCubit(
      repository: repository,
      preferences: AssistantPreferences(currentUserId: () => actor.id),
      prepareResetWorkspaceContext: (_, current) =>
          AssistantPreparedResetContext(
            actorId: actor.id,
            workspaceId: ws,
            isCurrent: current,
            publishCurrent: current,
          ),
      onWorkspaceContextChanged: (_) async {},
      onSoulRefreshRequested: () async {},
      onImmersiveModeChanged: (_) {},
      onChatRestored: (_) async {},
    );
    await chat.loadWorkspace(ws);
    if (await repository.hasUnknownChatCreation(ws)) {
      // A prior negative control in this isolate can hold this synthetic scope.
      // Only the complete informed reset protocol releases that process hold.
      final consentTarget = await chat.inspectResetConsentTarget(ws);
      final outcome = await chat.resetConversationAcknowledged(
        ws,
        acknowledgeUnknownCreation: true,
        consentTarget: consentTarget,
      );
      if (!outcome.committedCurrent) {
        throw StateError('Synthetic reset fixture was not acknowledged');
      }
    }
  }

  Future<bool> resetDuringPendingRestore() async {
    final history = Completer<void>();
    historyGate = history.future;
    await AssistantPreferences(
      currentUserId: () => actor.id,
    ).saveChatId(ws, saved);
    final loading = chat.loadWorkspace(ws);
    await historyEntered.future;
    try {
      final consentTarget = await chat.inspectResetConsentTarget(ws);
      return (await chat.resetConversationAcknowledged(
        ws,
        acknowledgeUnknownCreation: true,
        consentTarget: consentTarget,
      )).committedCurrent;
    } finally {
      history.complete();
      await loading;
    }
  }

  Future<void> close() async {
    if (!response.isCompleted) response.complete(receipt());
    await chat.close();
  }

  Future<AssistantSubmissionOutcome> send() => chat.submitAcknowledged(
    wsId: ws,
    message: 'Synthetic draft',
    modelId: 'model',
    thinkingMode: AssistantThinkingMode.thinking,
    creditSource: AssistantCreditSource.workspace,
    workspaceContextId: ws,
    timezone: 'UTC',
  );
  Future<void> attach() => chat.addComposerAttachments(
    wsId: ws,
    files: [
      AssistantMemoryFile(name: 'fixture.txt', bytes: Uint8List.fromList([65])),
    ],
    modelId: 'model',
    timezone: 'UTC',
  );
}
