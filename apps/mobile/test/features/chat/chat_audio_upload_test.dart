import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/chat/data/chat_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  test('m4a uses MP4 audio MIME and preserves bytes', () async {
    final api = _Api();
    final bytes = Uint8List.fromList([0, 1, 2, 3]);
    when(
      () => api.postJson(
        '/api/v1/workspaces/ws/chat/conversations/chat/attachments/upload-url',
        any(),
      ),
    ).thenAnswer(
      (_) async => {
        'signedUrl': 'https://storage.example/upload',
        'attachment': {
          'id': 'attachment',
          'conversationId': 'chat',
          'filename': 'voice-message.m4a',
          'path': 'chats/chat/voice-message.m4a',
        },
      },
    );
    final client = MockClient((request) async {
      expect(request.method, 'PUT');
      expect(request.headers['content-type'], 'audio/mp4');
      expect(request.bodyBytes, bytes);
      return http.Response('', 200);
    });
    final file = AssistantMemoryFile(name: 'voice-message.m4a', bytes: bytes);

    final picked = await AssistantFilePickerResult.fromPlatformFile(
      file,
      'attachment',
    );
    expect(picked.mimeType, 'audio/mp4');
    final attachment = await ChatRepository(
      apiClient: api,
      httpClient: client,
    ).uploadAttachment('ws', 'chat', file: file);
    expect(attachment.storagePath, 'chats/chat/voice-message.m4a');

    final payload =
        verify(
              () => api.postJson(
                '/api/v1/workspaces/ws/chat/conversations/chat/attachments/upload-url',
                captureAny(),
              ),
            ).captured.single
            as Map<String, dynamic>;
    expect(payload['filename'], 'voice-message.m4a');
    expect(payload['contentType'], 'audio/mp4');
  });
}
