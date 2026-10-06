import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
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
    when(() => api.patchJson(any(), any())).thenAnswer((_) async {
      settingsPatched = true;
      return {};
    });
    when(
      () => api.sendJsonStream(
        'POST',
        any(),
        any(),
        accept: 'application/x-ndjson',
      ),
    ).thenAnswer((_) async {
      started.complete();
      return http.StreamedResponse(
        body.stream,
        201,
        headers: {'content-type': 'application/x-ndjson'},
      );
    });
  }

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
      messages: const [AssistantMessage(id: 'user', role: 'user')],
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
  );

  void part(Map<String, dynamic> part) =>
      send({'type': 'assistant_part', 'part': part});
  void send(Map<String, dynamic> event) =>
      body.add(utf8.encode('${jsonEncode(event)}\n'));
  void input({String callId = 'rename', String name = 'update_my_settings'}) =>
      part({
        'type': 'tool-input-available',
        'toolCallId': callId,
        'toolName': name,
        'input': {'name': 'Nova'},
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
          'id': 'saved-reply',
          'conversationId': 'chat',
          'kind': 'assistant',
          'content': 'Confirmed answer',
        },
      ],
    });
    send({'type': 'done'});
  }
}
