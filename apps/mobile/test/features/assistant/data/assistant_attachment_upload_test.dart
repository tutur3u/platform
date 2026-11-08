import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_attachment_upload.dart';
import 'package:mobile/features/assistant/data/assistant_memory_file.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

const _native = '11111111-1111-4111-8111-111111111111';

class _UploadApi extends ApiClient {
  _UploadApi(this.respond) : super(baseUrl: 'http://localhost');

  final Map<String, dynamic> Function(String path, Object? body) respond;
  final calls = <(String, Object?)>[];

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    calls.add((path, body));
    return respond(path, body);
  }
}

AssistantFilePickerResult _file(String name, String mime, int size) {
  final bytes = Uint8List(size);
  return AssistantFilePickerResult(
    id: 'local-id',
    file: AssistantMemoryFile(name: name, bytes: bytes),
    name: name,
    size: size,
    path: '',
    mimeType: mime,
  );
}

void main() {
  test('native chats upload through the conversation route only', () async {
    final api = _UploadApi(
      (path, _) => {
        'signedUrl': 'https://storage.test/put',
        'token': 'upload-token',
        'attachment': {'path': 'chats/$_native/abc-voice.m4a'},
      },
    );
    final puts = <http.Request>[];
    final client = MockClient((request) async {
      puts.add(request);
      return http.Response('', 200);
    });
    final progress = <double>[];

    final uploaded =
        await AssistantAttachmentUploader(
          apiClient: api,
          httpClient: client,
        ).upload(
          wsId: 'ws',
          chatId: _native,
          file: _file('voice.m4a', 'audio/mp4', 200 * 1024),
          onProgress: progress.add,
        );

    expect(
      api.calls.single.$1,
      '/api/v1/workspaces/ws/chat/conversations/$_native/attachments/upload-url',
    );
    expect(api.calls.single.$2, {
      'filename': 'voice.m4a',
      'contentType': 'audio/mp4',
      'sizeBytes': 200 * 1024,
    });
    expect(puts.single.method, 'PUT');
    expect(puts.single.headers['content-type'], startsWith('audio/mp4'));
    expect(puts.single.headers['authorization'], 'Bearer upload-token');
    expect(puts.single.bodyBytes.length, 200 * 1024);
    // The send path accepts only this conversation's own prefix.
    expect(uploaded.storagePath, 'chats/$_native/abc-voice.m4a');
    expect(uploaded.isUploaded, isTrue);
    expect(progress.first, 0);
    expect(progress.last, 1);
    expect(progress.length, greaterThan(2));
  });

  test('legacy chats use the AI resource route with the storage id', () async {
    final api = _UploadApi(
      (path, _) => {
        'signedUrl': 'https://storage.test/put',
        'token': 't',
        'path': 'ws/chats/ai/resources/$_native/1_photo.jpg',
      },
    );
    final client = MockClient((_) async => http.Response('', 200));

    final uploaded =
        await AssistantAttachmentUploader(
          apiClient: api,
          httpClient: client,
        ).upload(
          wsId: 'ws',
          chatId: 'ai-chat-$_native',
          file: _file('photo.jpg', 'image/jpeg', 10),
        );

    expect(api.calls.single.$1, '/api/ai/chat/upload-url');
    expect(api.calls.single.$2, {
      'filename': 'photo.jpg',
      'wsId': 'ws',
      'sizeBytes': 10,
      'chatId': _native,
    });
    expect(uploaded.storagePath, 'ws/chats/ai/resources/$_native/1_photo.jpg');
  });

  test(
    'a legacy ai-chat voice note never touches the conversation route',
    () async {
      // Production 2026-10-25 19:27 GMT+7: this exact path answered 400 on the
      // Chat attachment route and the client never fell back.
      final api = _UploadApi(
        (path, _) => path.startsWith('/api/v1/')
            ? throw const ApiException(message: 'invalid uuid', statusCode: 400)
            : {
                'signedUrl': 'https://storage.test/put',
                'token': 't',
                'path': 'ws/chats/ai/resources/$_native/1_voice-message.m4a',
              },
      );
      final client = MockClient((_) async => http.Response('', 200));

      final uploaded =
          await AssistantAttachmentUploader(
            apiClient: api,
            httpClient: client,
          ).upload(
            wsId: 'ws',
            chatId: 'ai-chat-$_native',
            file: _file('voice-message.m4a', 'audio/mp4', 4096),
          );

      expect(api.calls.map((call) => call.$1), ['/api/ai/chat/upload-url']);
      expect((api.calls.single.$2! as Map)['chatId'], _native);
      expect(uploaded.isUploaded, isTrue);
      expect(uploaded.type, 'audio/mp4');
    },
  );

  for (final (status, failure) in const [
    (401, AssistantAttachmentFailure.forbidden),
    (403, AssistantAttachmentFailure.forbidden),
    (404, AssistantAttachmentFailure.forbidden),
    (500, AssistantAttachmentFailure.server),
  ]) {
    for (final (label, chatId) in const [
      ('native', _native),
      ('legacy', 'ai-chat-$_native'),
    ]) {
      test(
        'a $status from the $label route never falls back to another store',
        () async {
          final api = _UploadApi(
            (_, _) => throw ApiException(
              message: 'Failed to prepare chat attachment',
              statusCode: status,
            ),
          );
          final client = MockClient((_) async => http.Response('', 200));

          await expectLater(
            AssistantAttachmentUploader(
              apiClient: api,
              httpClient: client,
            ).upload(
              wsId: 'ws',
              chatId: chatId,
              file: _file('voice.m4a', 'audio/mp4', 10),
            ),
            throwsA(
              isA<AssistantAttachmentUploadException>()
                  .having((error) => error.failure, 'failure', failure)
                  .having((error) => error.statusCode, 'statusCode', status),
            ),
          );
          expect(api.calls, hasLength(1));
        },
      );
    }
  }

  test('maps storage and transport failures to actionable reasons', () async {
    final cases = <ApiException, AssistantAttachmentFailure>{
      const ApiException(message: 'too big', statusCode: 413):
          AssistantAttachmentFailure.tooLarge,
      const ApiException(
        message: 'Unsupported file type',
        statusCode: 400,
        code: 'unsupported_file_type',
      ): AssistantAttachmentFailure.unsupported,
      const ApiException(message: 'Chat not found', statusCode: 404):
          AssistantAttachmentFailure.forbidden,
      const ApiException.transport(message: 'offline'):
          AssistantAttachmentFailure.network,
      const ApiException(message: 'boom', statusCode: 502):
          AssistantAttachmentFailure.server,
    };
    for (final MapEntry(key: error, value: failure) in cases.entries) {
      expect(AssistantAttachmentFailure.fromApi(error), failure);
    }
    expect(AssistantAttachmentFailure.network.retryable, isTrue);
    expect(AssistantAttachmentFailure.tooLarge.retryable, isFalse);
  });

  test('a rejected signed PUT surfaces as a failed upload', () async {
    final api = _UploadApi(
      (_, _) => {
        'signedUrl': 'https://storage.test/put',
        'attachment': {'path': 'chats/$_native/a.jpg'},
      },
    );
    final client = MockClient((_) async => http.Response('quota', 413));

    await expectLater(
      AssistantAttachmentUploader(apiClient: api, httpClient: client).upload(
        wsId: 'ws',
        chatId: _native,
        file: _file('a.jpg', 'image/jpeg', 10),
      ),
      throwsA(
        isA<AssistantAttachmentUploadException>()
            .having((error) => error.statusCode, 'status', 413)
            .having(
              (error) => error.failure,
              'failure',
              AssistantAttachmentFailure.tooLarge,
            ),
      ),
    );
  });

  test(
    'refuses files over the model budget before contacting the server',
    () async {
      final api = _UploadApi((_, _) => fail('must not prepare'));
      final client = MockClient((_) async => fail('must not upload'));

      await expectLater(
        AssistantAttachmentUploader(apiClient: api, httpClient: client).upload(
          wsId: 'ws',
          chatId: _native,
          file: _file('long.wav', 'audio/wav', 33 * 1024 * 1024),
        ),
        throwsA(
          isA<AssistantAttachmentUploadException>().having(
            (error) => error.failure,
            'failure',
            AssistantAttachmentFailure.tooLarge,
          ),
        ),
      );
    },
  );
}
