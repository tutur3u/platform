import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/chat_attachment_delivery.dart';
import 'package:mobile/data/sources/api_client.dart';

class _ChatUploadApi extends ApiClient {
  _ChatUploadApi() : super(baseUrl: 'http://localhost');

  int preparations = 0;

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    preparations++;
    expect(path, '/chat/attachments/upload-url');
    expect(body, {
      'filename': 'photo.png',
      'contentType': 'image/png',
      'sizeBytes': 3,
    });
    return {
      'signedUrl': 'https://upload.example.test/photo',
      'headers': {'x-upload-token': 'fresh'},
      'attachment': {'id': 'server-id', 'storage_path': 'chat/photo.png'},
    };
  }
}

void main() {
  test('chat replay signs and uploads the encrypted payload bytes', () async {
    final api = _ChatUploadApi();
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('', 200);
    });
    final result = await deliverChatAttachment(
      api: api,
      httpClient: client,
      uploadPath: '/chat/attachments/upload-url',
      filename: 'photo.png',
      contentType: 'image/png',
      bytes: Uint8List.fromList([1, 2, 3]),
    );
    expect(api.preparations, 1);
    expect(requests.single.bodyBytes, [1, 2, 3]);
    expect(requests.single.headers['x-upload-token'], 'fresh');
    expect(result['storage_path'], 'chat/photo.png');
    client.close();
    api.dispose();
  });

  test('an ambiguous upload failure remains reviewable', () async {
    final api = _ChatUploadApi();
    final client = MockClient(
      (_) async => throw const SocketException('Connection lost'),
    );
    await expectLater(
      deliverChatAttachment(
        api: api,
        httpClient: client,
        uploadPath: '/chat/attachments/upload-url',
        filename: 'photo.png',
        contentType: 'image/png',
        bytes: Uint8List.fromList([1, 2, 3]),
      ),
      throwsA(
        isA<ApiException>().having((error) => error.statusCode, 'status', 0),
      ),
    );
    client.close();
    api.dispose();
  });
}
