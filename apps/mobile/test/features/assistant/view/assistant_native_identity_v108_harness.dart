import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';

import 'assistant_settings_repair_harness.dart';
import 'assistant_v87_harness.dart';

class NativeIdentityApi extends V87Api {
  final saved = <Map<String, dynamic>>[];
  final posts = <Map<String, dynamic>>[];
  bool loseReceipt = true;
  bool denyRead = false;
  bool hideSaved = false;
  bool jsonResponse = false;
  bool modelError = false;
  String timestamp = '2026-10-18T00:00:00.123456Z';
  Completer<void>? readGate;
  Completer<void>? settingsGate;
  Completer<void> readEntered = Completer<void>();
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    if (path.contains('/messages')) {
      if (denyRead) {
        throw const ApiException(message: 'Synthetic denial', statusCode: 403);
      }
      if (!readEntered.isCompleted) readEntered.complete();
      final gate = readGate;
      readGate = null;
      await gate?.future;
      return {'messages': hideSaved ? <dynamic>[] : saved};
    }
    final settings = settingsGate;
    settingsGate = null;
    await settings?.future;
    return await super.getJson(
      path,
      requiresAuth: requiresAuth,
      timeout: timeout,
    );
  }

  @override
  Future<http.StreamedResponse> sendJsonStreamAcknowledged(
    String method,
    String path,
    Object? body, {
    required ApiMutationAdmission admission,
    String accept = 'application/octet-stream',
  }) async {
    admission.recordDispatchPossible();
    return await sendJsonStream(method, path, body, accept: accept);
  }

  @override
  Future<http.StreamedResponse> sendJsonStream(
    String method,
    String path,
    Object? body, {
    String accept = 'application/octet-stream',
    bool requiresAuth = true,
  }) async {
    final payload = Map<String, dynamic>.from(body! as Map);
    posts.add(payload);
    final request = payload['clientRequestId'];
    final row = <String, dynamic>{
      'id':
          '77777777-7777-4777-8777-${posts.length.toString().padLeft(12, '0')}',
      'conversationId': repairChat,
      'senderId': repairActor,
      'kind': 'user',
      'content': payload['content'],
      'createdAt': timestamp,
      'metadata': {'clientRequestId': request},
      'attachments': payload['attachments'] ?? <dynamic>[],
    };
    saved.add(row);
    final assistant = {
      ...row,
      'id':
          '88888888-8888-4888-8888-${posts.length.toString().padLeft(12, '0')}',
      'kind': 'assistant',
      'content': 'Synthetic reply',
      'metadata': <String, dynamic>{},
    };
    final events = [
      {'type': 'message', 'message': row},
      if (modelError)
        {'type': 'error', 'message': 'synthetic model failure'}
      else
        {
          'type': 'messages',
          'messages': [assistant],
        },
      {'type': 'done'},
    ];
    final text = loseReceipt
        ? ''
        : jsonResponse
        ? jsonEncode({
            'message': row,
            'messages': [row, if (!modelError) assistant],
          })
        : '${events.map(jsonEncode).join('\n')}\n';
    return http.StreamedResponse(
      Stream.value(utf8.encode(text)),
      201,
      headers: {
        'content-type': jsonResponse
            ? 'application/json'
            : 'application/x-ndjson',
      },
    );
  }
}

class NativeIdentityRepository extends V87Repository {
  NativeIdentityRepository(NativeIdentityApi super.api);
  @override
  AssistantRepository get real => _real;
  late final _real = AssistantRepository(
    apiClient: api,
    chatRepository: ChatRepository(apiClient: api),
    currentUserId: () => repairActor,
  );
}
