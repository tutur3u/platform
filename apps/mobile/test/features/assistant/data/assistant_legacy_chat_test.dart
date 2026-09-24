import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/data/assistant_stream_parser.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test('native retry sends the saved user message request ID', () async {
    final api = _Api();
    final chats = ChatRepository(apiClient: api);
    when(
      () => api.sendJsonStream(
        'POST',
        '/api/v1/workspaces/ws/chat/conversations/chat/messages',
        any(),
        accept: 'application/x-ndjson',
      ),
    ).thenAnswer(
      (_) async => http.StreamedResponse(
        Stream.value(utf8.encode('{"type":"done"}\n')),
        201,
        headers: {'content-type': 'application/x-ndjson'},
      ),
    );

    await chats
        .sendMessageStream(
          'ws',
          'chat',
          content: 'Hello',
          clientRequestId: '11111111-1111-4111-8111-111111111111',
        )
        .toList();

    final payload =
        verify(
              () => api.sendJsonStream(
                'POST',
                '/api/v1/workspaces/ws/chat/conversations/chat/messages',
                captureAny(),
                accept: 'application/x-ndjson',
              ),
            ).captured.single
            as Map<String, dynamic>;
    expect(payload['clientRequestId'], '11111111-1111-4111-8111-111111111111');
  });

  for (final legacy in [true, false]) {
    test(
      legacy
          ? 'legacy settings rejection uses authenticated streaming client'
          : 'invalid settings do not fall back to legacy generation',
      () async {
        final api = _Api();
        final chats = ChatRepository(apiClient: api);
        when(
          () => api.patchJson(
            '/api/v1/workspaces/ws/chat/conversations/chat/ai-settings',
            any(),
          ),
        ).thenThrow(
          ApiException(
            message: legacy
                ? 'Conversation is not an AI chat'
                : 'Invalid request body',
            statusCode: 400,
          ),
        );
        when(
          () => api.sendJsonStream(
            'POST',
            '/api/ai/chat',
            any(),
            accept: 'text/event-stream',
          ),
        ).thenAnswer(
          (_) async => http.StreamedResponse(
            Stream.value(utf8.encode('data: [DONE]\n\n')),
            200,
          ),
        );
        final repository = AssistantRepository(
          apiClient: api,
          tasksApiClient: api,
          chatRepository: chats,
        );
        final stream = repository.streamChat(
          chatId: 'chat',
          wsId: 'ws',
          workspaceContextId: 'context',
          modelId: 'model',
          messages: const [],
          thinkingMode: AssistantThinkingMode.fast,
          creditSource: AssistantCreditSource.workspace,
          timezone: 'Asia/Ho_Chi_Minh',
          creditWsId: 'credits',
        );
        if (legacy) {
          expect(await stream.toList(), [isA<AssistantDoneStreamEvent>()]);
          final payload =
              verify(
                    () => api.sendJsonStream(
                      'POST',
                      '/api/ai/chat',
                      captureAny(),
                      accept: 'text/event-stream',
                    ),
                  ).captured.single
                  as Map<String, dynamic>;
          expect(payload['creditWsId'], 'credits');
          expect(payload['creditSource'], 'workspace');
          expect(payload['id'], 'chat');
        } else {
          await expectLater(stream, emitsError(isA<ApiException>()));
          verifyNever(
            () => api.sendJsonStream(
              any(),
              any(),
              any(),
              accept: any(named: 'accept'),
            ),
          );
        }
      },
    );
  }
}
