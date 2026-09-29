import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/time_request_image_delivery.dart';
import 'package:mobile/data/sources/api_client.dart';

class _TimerUploadApi extends ApiClient {
  _TimerUploadApi() : super(baseUrl: 'http://localhost');

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    expect(path, '/api/v1/workspaces/ws/time-tracking/requests/upload-url');
    expect(body, {
      'requestId': 'request-1',
      'files': [
        {'filename': 'evidence.png'},
      ],
    });
    return {
      'uploads': [
        {
          'signedUrl': 'https://upload.example.test/image',
          'token': 'fresh-token',
          'path': 'requests/request-1/evidence.png',
        },
      ],
    };
  }
}

void main() {
  final images = [
    {
      'filename': 'evidence.png',
      'contentType': 'image/png',
      'bytes': base64Encode([1, 2, 3]),
    },
  ];

  test('replay obtains fresh URLs and uploads staged bytes', () async {
    final api = _TimerUploadApi();
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      return http.Response('', 200);
    });
    final paths = await deliverTimeRequestImages(
      api: api,
      httpClient: client,
      workspaceId: 'ws',
      requestId: 'request-1',
      images: images,
    );
    expect(paths, ['requests/request-1/evidence.png']);
    expect(requests.single.bodyBytes, [1, 2, 3]);
    expect(requests.single.headers['authorization'], 'Bearer fresh-token');
    api.dispose();
    client.close();
  });

  test('uncertain upload failure is reviewable', () async {
    final api = _TimerUploadApi();
    final client = MockClient(
      (_) async => throw const SocketException('Connection lost'),
    );
    await expectLater(
      deliverTimeRequestImages(
        api: api,
        httpClient: client,
        workspaceId: 'ws',
        requestId: 'request-1',
        images: images,
      ),
      throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 0)),
    );
    api.dispose();
    client.close();
  });
}
