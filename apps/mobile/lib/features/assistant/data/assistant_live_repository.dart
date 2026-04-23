import 'package:mobile/data/sources/api_client.dart';
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
    final response = await _apiClient.postJson('/api/v1/assistant/live/token', {
      'wsId': wsId,
      if (chatId != null) 'chatId': chatId,
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
      queryParameters: {
        'wsId': wsId,
        'scopeKey': scopeKey,
      },
    ).query;
    await _apiClient.deleteJson('/api/v1/live/session?$query');
  }

  Future<Map<String, dynamic>> executeToolCall({
    required String wsId,
    required String functionName,
    required Map<String, dynamic> args,
  }) async {
    final response = await _apiClient.postJson('/api/v1/live/tools/execute', {
      'wsId': wsId,
      'functionName': functionName,
      'args': args,
    });
    return (response['result'] as Map<String, dynamic>?) ?? response;
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
