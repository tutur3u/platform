import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/drive_upload_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class _UploadApi extends ApiClient {
  _UploadApi() : super(baseUrl: 'http://localhost');

  final calls = <(String, Object?)>[];

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    calls.add((path, body));
    if (path == DriveEndpoints.uploadUrl('workspace')) {
      return {
        'signedUrl': 'https://upload.example.test/file',
        'path': 'folder/report.txt',
        'fullPath': 'workspace/folder/report.txt',
        'headers': {'x-upload-token': 'upload'},
      };
    }
    if (path == DriveEndpoints.finalizeUpload('workspace')) {
      return {
        'autoExtract': {'status': 'queued'},
      };
    }
    throw StateError('Unexpected upload endpoint: $path');
  }
}

void main() {
  test(
    'delivery signs at replay time and finalizes the uploaded bytes',
    () async {
      final api = _UploadApi();
      final bytes = Uint8List.fromList([1, 2, 3]);
      final requests = <http.Request>[];
      final httpClient = MockClient((request) async {
        requests.add(request);
        return http.Response('', 200);
      });

      final result = await deliverDriveUpload(
        api: api,
        httpClient: httpClient,
        workspaceId: 'workspace',
        filename: 'report.txt',
        directoryPath: 'folder',
        bytes: bytes,
        contentType: 'text/plain',
      );

      expect(api.calls, hasLength(2));
      expect(api.calls.first.$1, DriveEndpoints.uploadUrl('workspace'));
      expect(api.calls.first.$2, {
        'filename': 'report.txt',
        'path': 'folder',
        'size': 3,
      });
      expect(requests, hasLength(1));
      expect(
        requests.single.url.toString(),
        'https://upload.example.test/file',
      );
      expect(requests.single.bodyBytes, bytes);
      expect(requests.single.headers['content-type'], 'text/plain');
      expect(result.path, 'folder/report.txt');
      expect(result.autoExtractStatus, 'queued');
      api.dispose();
      httpClient.close();
    },
  );

  test('failed upload does not finalize', () async {
    final api = _UploadApi();
    final httpClient = MockClient((_) async => http.Response('', 500));

    await expectLater(
      deliverDriveUpload(
        api: api,
        httpClient: httpClient,
        workspaceId: 'workspace',
        filename: 'report.txt',
        bytes: Uint8List.fromList([1]),
        contentType: 'text/plain',
      ),
      throwsA(isA<ApiException>()),
    );
    expect(api.calls, hasLength(1));
    api.dispose();
    httpClient.close();
  });

  test('lost upload connection becomes a reviewable network failure', () async {
    final api = _UploadApi();
    final httpClient = MockClient(
      (_) async => throw const SocketException('Connection lost'),
    );

    await expectLater(
      deliverDriveUpload(
        api: api,
        httpClient: httpClient,
        workspaceId: 'workspace',
        filename: 'report.txt',
        bytes: Uint8List.fromList([1]),
        contentType: 'text/plain',
      ),
      throwsA(
        isA<ApiException>().having((error) => error.statusCode, 'status', 0),
      ),
    );
    expect(api.calls, hasLength(1));
    api.dispose();
    httpClient.close();
  });
}
