import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/data/chat_realtime_client.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

class _Realtime extends Mock implements ChatRealtimeClient {}

void main() {
  test('opening Chat shows the list until a thread is selected', () async {
    final api = _Api();
    final realtime = _Realtime();
    when(() => api.getJson(any())).thenAnswer((invocation) async {
      final path = invocation.positionalArguments.first as String;
      if (path.contains('/conversations?')) {
        return {
          'conversations': [
            {
              'id': 'latest',
              'wsId': 'workspace',
              'type': 'ai',
              'metadata': {'source': 'ai-agent', 'readOnly': true},
            },
          ],
        };
      }
      if (path.endsWith('/friend-requests')) return {};
      throw StateError('Unexpected API request: $path');
    });
    when(
      () => realtime.connect('workspace'),
    ).thenAnswer((_) => const Stream.empty());
    final cubit = ChatCubit(
      repository: ChatRepository(apiClient: api),
      realtimeClient: realtime,
    );
    await cubit.setWorkspace('workspace');
    expect(cubit.state.conversations, hasLength(1));
    expect(cubit.state.selectedConversationId, isNull);
    await cubit.close();
  });

  test('discovery agents never call normal conversation APIs', () async {
    final api = _Api();
    final realtime = _Realtime();
    when(() => api.getJson(any())).thenAnswer((invocation) async {
      final path = invocation.positionalArguments.first as String;
      if (path.contains('/conversations?')) {
        return {
          'conversations': [
            {
              'id': 'ai-agent-discovery',
              'wsId': 'workspace',
              'type': 'ai',
              'metadata': {'source': 'ai-agent', 'readOnly': true},
              'latestMessage': {
                'id': 'status',
                'conversationId': 'ai-agent-discovery',
                'content': 'Read-only agent channel',
                'kind': 'system',
              },
            },
          ],
        };
      }
      if (path.endsWith('/friend-requests')) return {};
      throw StateError('Unexpected API request: $path');
    });
    when(
      () => realtime.connect('workspace'),
    ).thenAnswer((_) => const Stream.empty());
    final cubit = ChatCubit(
      repository: ChatRepository(apiClient: api),
      realtimeClient: realtime,
    );
    await cubit.setWorkspace(
      'workspace',
      initialConversationId: 'ai-agent-discovery',
    );
    expect(cubit.state.messageStatus, ChatMessageStatus.loaded);
    expect(
      cubit.state.selectedMessages.single.content,
      'Read-only agent channel',
    );
    verify(() => api.getJson(any())).called(2);
    final agent = cubit.state.selectedConversation!;
    await cubit.sendMessage('Should not send');
    await cubit.togglePin(agent);
    await cubit.deleteConversation(agent);
    await cubit.loadConversationPanels();
    await cubit.updateAiSettings(modelId: 'unused');
    verifyNoMoreInteractions(api);
    await cubit.close();
  });
}
