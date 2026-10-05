import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/models/assistant_chat_identity.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';

class AssistantLiveRepository {
  AssistantLiveRepository({ApiClient? apiClient})
    : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;

  Future<AssistantLiveTokenEnvelope> fetchLiveToken({
    required String wsId,
    String? chatId,
    String? model,
    bool forceFresh = false,
  }) async {
    final resumableChatId = assistantLiveChatUuid(chatId);
    final response = await _apiClient.postJson('/api/v1/assistant/live/token', {
      'wsId': wsId,
      'toolProtocol': 'canonical-v1',
      if (resumableChatId != null) 'chatId': resumableChatId,
      if (model != null) 'model': model,
      if (forceFresh) 'forceFresh': true,
    });
    return AssistantLiveTokenEnvelope.fromJson(response);
  }

  Future<void> storeSessionHandle({
    required String wsId,
    required String scopeKey,
    required String sessionHandle,
  }) async {
    await _apiClient.postJson('/api/v1/live/session', {
      'wsId': wsId,
      'scopeKey': scopeKey,
      'sessionHandle': sessionHandle,
    });
  }

  Future<void> clearSessionHandle({
    required String wsId,
    required String scopeKey,
  }) async {
    final query = Uri(
      queryParameters: {'wsId': wsId, 'scopeKey': scopeKey},
    ).query;
    await _apiClient.deleteJson('/api/v1/live/session?$query');
  }

  Future<Map<String, dynamic>> executeToolCall({
    required String wsId,
    required String functionName,
    required Map<String, dynamic> args,
    String toolProtocol = 'legacy',
    String? toolCallId,
  }) async {
    final canonical = toolProtocol == 'canonical-v1';
    if (canonical && (toolCallId == null || toolCallId.isEmpty)) {
      throw ArgumentError('Canonical Live tools require a provider call ID');
    }
    final response = await _apiClient.postJson(
      canonical
          ? '/api/v1/assistant/live/tools/execute'
          : '/api/v1/live/tools/execute',
      {
        'wsId': wsId,
        'functionName': functionName,
        if (canonical) 'toolCallId': toolCallId,
        'args': args,
      },
    );
    final result = response['result'];
    if (result is Map<String, dynamic>) return result;
    return response;
  }

  Future<void> persistLiveTurn({
    required String wsId,
    required String chatId,
    required String turnId,
    required String model,
    required List<Map<String, dynamic>> messages,
  }) async {
    await _apiClient.postJson('/api/v1/assistant/live/turns', {
      'wsId': wsId,
      'chatId': chatId,
      'turnId': turnId,
      'model': model,
      'messages': messages,
    });
  }
}
