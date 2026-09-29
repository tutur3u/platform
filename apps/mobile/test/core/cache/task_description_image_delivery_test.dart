import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/cache/task_description_image_delivery.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  test(
    'task image delivery uses a fresh URL and returns the shared path',
    () async {
      final api = _MockApiClient();
      final bytes = Uint8List.fromList([7, 8, 9]);
      when(() => api.postJson(any(), any())).thenAnswer(
        (_) async => {
          'signedUrl': 'https://upload.test/task',
          'token': 'fresh-token',
          'path': 'tasks/image.png',
        },
      );
      final client = MockClient((request) async {
        expect(request.method, 'PUT');
        expect(request.headers['authorization'], 'Bearer fresh-token');
        expect(request.bodyBytes, bytes);
        return http.Response('', 200);
      });

      final shared = await deliverTaskDescriptionImage(
        api: api,
        httpClient: client,
        workspaceId: 'ws-1',
        filename: 'image.png',
        contentType: 'image/png',
        bytes: bytes,
        taskId: 'task-1',
      );
      expect(shared, contains('/api/v1/workspaces/ws-1/storage/share?'));
      expect(shared, contains('tasks%2Fimage.png'));
      verify(() => api.postJson(any(), any())).called(1);
      client.close();
    },
  );
}
