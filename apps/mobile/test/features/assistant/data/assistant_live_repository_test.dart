import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  const id = 'dbdee3eb-3b6e-4422-93b4-829b825a8608';
  for (final chatId in [null, id, 'ai-agent-thread-$id']) {
    test('Live accepts only resumable UUIDs: $chatId', () async {
      final api = _Api();
      when(
        () => api.postJson('/api/v1/assistant/live/token', any()),
      ).thenAnswer((invocation) async {
        final body = invocation.positionalArguments[1] as Map;
        expect(body['wsId'], 'workspace');
        expect(body['chatId'], chatId == id ? id : null);
        return {
          'token': 'test-token',
          'chatId': id,
          'scopeKey': 'scope',
          'model': 'test-model',
          'seedHistory': <Map<String, dynamic>>[],
        };
      });
      final session = await AssistantLiveRepository(
        apiClient: api,
      ).fetchLiveToken(wsId: 'workspace', chatId: chatId);
      expect(session.chatId, id);
      verify(
        () => api.postJson('/api/v1/assistant/live/token', any()),
      ).called(1);
    });
  }
}
