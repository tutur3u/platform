import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_chat_persistence_contract.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

import '../view/background_reply_harness.dart';

class _Api extends Mock implements ApiClient {}

/// Uses the actual native NDJSON parser and AssistantRepository mapping.
class ToolReceiptRepository extends ReplyRepository {
  ToolReceiptRepository() {
    final api = _Api();
    transport = AssistantRepository(
      apiClient: api,
      tasksApiClient: api,
      chatRepository: ChatRepository(apiClient: api),
    );
    when(() => api.getJson(any())).thenAnswer(
      (_) async => {
        'settings': {
          'conversationId': nativeChatId,
          'modelId': 'model',
          'thinkingMode': 'thinking',
          'creditSource': 'workspace',
          'creditWsId': nativeWorkspaceId,
        },
      },
    );
    when(
      () => api.sendJsonStream(
        'POST',
        any(),
        any(),
        accept: 'application/x-ndjson',
      ),
    ).thenAnswer((invocation) async {
      final request = invocation.positionalArguments[2] as Map<String, dynamic>;
      final userReceipt = {
        'type': 'message',
        'message': {
          'id': '44444444-4444-4444-8444-444444444444',
          'conversationId': nativeChatId,
          'kind': 'user',
          'createdAt': '2026-10-12T00:00:00Z',
          'content': request['content'],
          'metadata': {'clientRequestId': request['clientRequestId']},
        },
      };
      final priorListen = body.onListen;
      body.onListen = () {
        priorListen?.call();
        scheduleMicrotask(() {
          if (!body.isClosed) send(userReceipt);
        });
      };
      started.complete();
      return http.StreamedResponse(
        body.stream,
        201,
        headers: {'content-type': 'application/x-ndjson'},
      );
    });
  }

  static const nativeChatId = '11111111-1111-4111-8111-111111111111';
  static const nativeWorkspaceId = '22222222-2222-4222-8222-222222222222';

  late final AssistantRepository transport;
  final body = StreamController<List<int>>();
  final started = Completer<void>();
  int soulReads = 0;
  bool settingsPatched = false;
  Object? soulFailure;
  Completer<AssistantSoul>? heldSoul;
  List<AssistantStreamEvent>? prepared;
  AssistantRestoredChat? restored;

  @override
  Future<AssistantRestoredChat?> restoreChat({
    required String wsId,
    required String chatId,
    bool forceRefresh = false,
    AssistantChatCacheOrigin? cacheOrigin,
  }) async => restored;

  Future<void> prepare() async {
    input();
    output();
    done();
    prepared = await nativeStream(
      chatId: 'chat',
      wsId: 'synthetic-ws',
      workspaceContextId: 'synthetic-ws',
      modelId: 'model',
      messages: const [
        AssistantMessage(
          id: '55555555-5555-4555-8555-555555555555',
          clientRequestId: '55555555-5555-4555-8555-555555555555',
          role: 'user',
          parts: [
            AssistantMessagePart(type: 'text', text: 'Synthetic prepared tool'),
          ],
        ),
      ],
      thinkingMode: AssistantThinkingMode.thinking,
      creditSource: AssistantCreditSource.workspace,
      timezone: 'UTC',
    ).toList();
  }

  @override
  Future<AssistantSoul> fetchSoul({bool forceRefresh = false}) async {
    if (!forceRefresh) return const AssistantSoul();
    soulReads++;
    final failure = soulFailure;
    if (failure is Exception) throw failure;
    if (failure is Error) throw failure;
    return await (heldSoul?.future ??
        Future.value(const AssistantSoul(name: 'Nova')));
  }

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
  }) {
    starts++;
    return prepared == null
        ? nativeStream(
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
          )
        : Stream.fromIterable(prepared!);
  }

  Stream<AssistantStreamEvent> nativeStream({
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
  }) => transport.streamChat(
    chatId: nativeChatId,
    wsId: nativeWorkspaceId,
    workspaceContextId: workspaceContextId,
    modelId: modelId,
    messages: messages,
    thinkingMode: thinkingMode,
    creditSource: creditSource,
    timezone: timezone,
    attachments: attachments,
    creditWsId: creditWsId == null ? null : nativeWorkspaceId,
  );

  void part(Map<String, dynamic> part) =>
      send({'type': 'assistant_part', 'part': part});
  void send(Map<String, dynamic> event) =>
      body.add(utf8.encode('${jsonEncode(event)}\n'));
  void input({
    String callId = 'rename',
    String name = 'update_my_settings',
    Map<String, dynamic> args = const {'name': 'Nova'},
  }) => part({
    'type': 'tool-input-available',
    'toolCallId': callId,
    'toolName': name,
    'input': args,
  });
  void output({
    String callId = 'rename',
    Object? result = const {
      'success': true,
      'updated': {'name': 'Nova'},
    },
    bool preliminary = false,
    String? name,
  }) => part({
    'type': 'tool-output-available',
    'toolCallId': callId,
    'output': result,
    if (preliminary) 'preliminary': true,
    if (name != null) 'toolName': name,
  });
  void done() {
    send({'type': 'assistant_delta', 'delta': 'Confirmed answer'});
    send({
      'type': 'messages',
      'messages': [
        {
          'id': '33333333-3333-4333-8333-333333333333',
          'conversationId': nativeChatId,
          'kind': 'assistant',
          'metadata': <String, dynamic>{},
          'createdAt': '2026-10-12T00:00:00Z',
          'content': 'Confirmed answer',
        },
      ],
    });
    send({'type': 'done'});
  }
}
