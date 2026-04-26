import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

class _MockHttpClient extends Mock implements http.Client {}

void main() {
  setUpAll(() {
    registerFallbackValue(Uri.parse('https://example.com'));
  });

  group('TaskRepository description APIs', () {
    late _MockApiClient apiClient;
    late _MockHttpClient httpClient;
    late TaskRepository repository;

    setUp(() {
      apiClient = _MockApiClient();
      httpClient = _MockHttpClient();
      repository = TaskRepository(apiClient: apiClient, httpClient: httpClient);
    });

    test('updateTaskDescription uses dedicated description endpoint', () async {
      Map<String, dynamic>? requestBody;

      when(() => apiClient.patchJson(any(), any())).thenAnswer((
        invocation,
      ) async {
        requestBody = invocation.positionalArguments[1] as Map<String, dynamic>;
        return <String, dynamic>{};
      });

      await repository.updateTaskDescription(
        wsId: 'ws-1',
        taskId: 'task-1',
        description: '{"type":"doc","content":[{"type":"paragraph"}]}',
      );

      verify(
        () => apiClient.patchJson(
          '/api/v1/workspaces/ws-1/tasks/task-1/description',
          any(),
        ),
      ).called(1);
      expect(requestBody, isNotNull);
      expect(requestBody!['description'], contains('"type":"doc"'));
      expect(requestBody!.containsKey('description_yjs_state'), isFalse);
    });

    test(
      'updateTaskDescription can clear description and send yjs state',
      () async {
        Map<String, dynamic>? requestBody;

        when(() => apiClient.patchJson(any(), any())).thenAnswer((
          invocation,
        ) async {
          requestBody =
              invocation.positionalArguments[1] as Map<String, dynamic>;
          return <String, dynamic>{};
        });

        await repository.updateTaskDescription(
          wsId: 'ws-1',
          taskId: 'task-1',
          descriptionYjsState: const [1, 2, 3],
        );

        expect(requestBody, isNotNull);
        expect(requestBody!['description'], isNull);
        expect(requestBody!['description_yjs_state'], const [1, 2, 3]);
      },
    );

    test(
      'uploadTaskDescriptionImage uploads file and returns share URL',
      () async {
        final tempDir = await Directory.systemTemp.createTemp(
          'task_description_upload_test',
        );
        addTearDown(() async => tempDir.delete(recursive: true));

        final imageFile = File('${tempDir.path}/inline.png');
        await imageFile.writeAsBytes(const [1, 2, 3, 4]);

        when(() => apiClient.postJson(any(), any())).thenAnswer((_) async {
          return {
            'signedUrl': 'https://upload.example.com/task-image',
            'token': 'upload-token',
            'path': 'ws-1/task-images/task-1/inline.png',
          };
        });

        when(
          () => httpClient.put(
            any(),
            headers: any(named: 'headers'),
            body: any(named: 'body'),
          ),
        ).thenAnswer((_) async => http.Response('', 200));

        final shareUrl = await repository.uploadTaskDescriptionImage(
          wsId: 'ws-1',
          localFilePath: imageFile.path,
          taskId: 'task-1',
        );

        verify(
          () => apiClient.postJson('/api/v1/workspaces/ws-1/tasks/upload-url', {
            'filename': 'inline.png',
            'taskId': 'task-1',
          }),
        ).called(1);

        verify(
          () => httpClient.put(
            Uri.parse('https://upload.example.com/task-image'),
            headers: {
              'Authorization': 'Bearer upload-token',
              'Content-Type': 'image/png',
            },
            body: any(named: 'body'),
          ),
        ).called(1);

        expect(
          shareUrl,
          '/api/v1/workspaces/ws-1/storage/share?'
          'path=ws-1%2Ftask-images%2Ftask-1%2Finline.png',
        );
      },
    );

    test('createBoardTask sends task dates at day bounds', () async {
      Map<String, dynamic>? requestBody;

      when(() => apiClient.postJson(any(), any())).thenAnswer((
        invocation,
      ) async {
        requestBody = invocation.positionalArguments[1] as Map<String, dynamic>;
        return {
          'task': {'id': 'task-1', 'list_id': 'list-1'},
        };
      });

      await repository.createBoardTask(
        wsId: 'ws-1',
        listId: 'list-1',
        name: 'Task',
        startDate: DateTime(2026, 4, 26, 15, 30),
        endDate: DateTime(2026, 4, 26, 15, 30),
      );

      expect(
        DateTime.parse(requestBody!['start_date'] as String).toLocal(),
        DateTime(2026, 4, 26),
      );
      expect(
        DateTime.parse(requestBody!['end_date'] as String).toLocal(),
        DateTime(2026, 4, 26, 23, 59, 59, 999),
      );
    });

    test('updateBoardTask sends task dates at day bounds', () async {
      Map<String, dynamic>? requestBody;

      when(() => apiClient.putJson(any(), any())).thenAnswer((
        invocation,
      ) async {
        requestBody = invocation.positionalArguments[1] as Map<String, dynamic>;
        return {
          'task': {'id': 'task-1', 'list_id': 'list-1'},
        };
      });

      await repository.updateBoardTask(
        wsId: 'ws-1',
        taskId: 'task-1',
        startDate: DateTime(2026, 4, 26, 15, 30),
        endDate: DateTime(2026, 4, 26, 15, 30),
      );

      expect(
        DateTime.parse(requestBody!['start_date'] as String).toLocal(),
        DateTime(2026, 4, 26),
      );
      expect(
        DateTime.parse(requestBody!['end_date'] as String).toLocal(),
        DateTime(2026, 4, 26, 23, 59, 59, 999),
      );
    });
  });
}
