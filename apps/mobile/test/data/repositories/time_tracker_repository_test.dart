import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

class _MockHttpClient extends Mock implements http.Client {}

void main() {
  setUpAll(() {
    registerFallbackValue(Uri.parse('https://example.com'));
  });

  group('TimeTrackerRepository signed upload flow', () {
    late _MockApiClient apiClient;
    late _MockHttpClient httpClient;
    late TimeTrackerRepository repository;

    setUp(() {
      apiClient = _MockApiClient();
      httpClient = _MockHttpClient();
      repository = TimeTrackerRepository(
        apiClient: apiClient,
        httpClient: httpClient,
      );

      when(
        () => httpClient.put(
          any(),
          headers: any(named: 'headers'),
          body: any(named: 'body'),
        ),
      ).thenAnswer((_) async => http.Response('', 200));
    });

    test(
      'createRequest uploads images first and sends storage paths',
      () async {
        final tempDir = await Directory.systemTemp.createTemp(
          'time_tracker_create_request_test',
        );
        addTearDown(() async => tempDir.delete(recursive: true));
        final imageFile = File('${tempDir.path}/proof.png');
        await imageFile.writeAsBytes(const [1, 2, 3, 4]);

        String? generatedRequestId;
        Map<String, dynamic>? createBody;

        when(
          () => apiClient.postJson(any(), any()),
        ).thenAnswer((invocation) async {
          final path = invocation.positionalArguments[0] as String;
          final body =
              invocation.positionalArguments[1] as Map<String, dynamic>;

          if (path.endsWith('/time-tracking/requests/upload-url')) {
            generatedRequestId = body['requestId'] as String;
            return {
              'uploads': [
                {
                  'signedUrl': 'https://upload.example.com/proof',
                  'token': 'token-1',
                  'path': '${generatedRequestId!}/proof.png',
                },
              ],
            };
          }

          if (path.endsWith('/time-tracking/requests')) {
            createBody = body;
            return {
              'request': {
                'id': generatedRequestId ?? 'req-1',
                'title': body['title'],
                'images': body['imagePaths'] ?? const <String>[],
              },
            };
          }

          throw StateError('Unexpected path: $path');
        });

        await repository.createRequest(
          'ws_1',
          title: 'Missed entry',
          startTime: DateTime.utc(2026, 2, 1, 9),
          endTime: DateTime.utc(2026, 2, 1, 10),
          imageLocalPaths: [imageFile.path],
        );

        expect(generatedRequestId, isNotNull);
        expect(
          generatedRequestId,
          matches(
            RegExp(
              '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-'
              '[89ab][0-9a-f]{3}-[0-9a-f]{12}',
            ),
          ),
        );

        expect(createBody, isNotNull);
        expect(createBody!['requestId'], generatedRequestId);
        expect(
          createBody!['imagePaths'],
          equals(<String>['${generatedRequestId!}/proof.png']),
        );

        verify(
          () => httpClient.put(
            Uri.parse('https://upload.example.com/proof'),
            headers: {
              'Authorization': 'Bearer token-1',
              'Content-Type': 'image/png',
            },
            body: any(named: 'body'),
          ),
        ).called(1);
      },
    );

    test('updateRequest uploads new images and sends JSON body', () async {
      const requestId = 'a9d7fb37-9f47-4c63-91f1-9ecf6d5f6d9c';
      final tempDir = await Directory.systemTemp.createTemp(
        'time_tracker_update_request_test',
      );
      addTearDown(() async => tempDir.delete(recursive: true));
      final imageFile = File('${tempDir.path}/new-proof.png');
      await imageFile.writeAsBytes(const [5, 6, 7]);

      Map<String, dynamic>? updateBody;

      when(
        () => apiClient.postJson(any(), any()),
      ).thenAnswer((_) async {
        return {
          'uploads': [
            {
              'signedUrl': 'https://upload.example.com/new-proof',
              'token': 'token-2',
              'path': '$requestId/new-proof.png',
            },
          ],
        };
      });

      when(
        () => apiClient.putJson(any(), any()),
      ).thenAnswer((invocation) async {
        updateBody = invocation.positionalArguments[1] as Map<String, dynamic>;
        return {
          'request': {
            'id': requestId,
            'title': updateBody!['title'],
            'images': updateBody!['newImagePaths'] ?? const <String>[],
          },
        };
      });

      await repository.updateRequest(
        'ws_1',
        requestId,
        'Updated request',
        DateTime.utc(2026, 2, 2, 9),
        DateTime.utc(2026, 2, 2, 10),
        removedImages: ['$requestId/old-proof.png'],
        newImageLocalPaths: [imageFile.path],
      );

      expect(updateBody, isNotNull);
      expect(
        updateBody!['newImagePaths'],
        equals(<String>['$requestId/new-proof.png']),
      );
      expect(
        updateBody!['removedImages'],
        equals(<String>['$requestId/old-proof.png']),
      );

      verify(
        () => apiClient.putJson(
          '/api/v1/workspaces/ws_1/time-tracking/requests/$requestId',
          any(),
        ),
      ).called(1);
    });

    test('updateGoal can send an explicit null weekly goal', () async {
      Map<String, dynamic>? updateBody;

      when(() => apiClient.patchJson(any(), any())).thenAnswer((
        invocation,
      ) async {
        updateBody = invocation.positionalArguments[1] as Map<String, dynamic>;
        return {
          'goal': {
            'id': 'goal-1',
            'ws_id': 'ws_1',
            'user_id': 'user-1',
            'daily_goal_minutes': 45,
            'weekly_goal_minutes': null,
            'is_active': true,
          },
        };
      });

      await repository.updateGoal(
        'ws_1',
        'goal-1',
        dailyGoalMinutes: 45,
        includeWeeklyGoalMinutes: true,
      );

      expect(updateBody, isNotNull);
      expect(updateBody!['dailyGoalMinutes'], 45);
      expect(updateBody!.containsKey('weeklyGoalMinutes'), isTrue);
      expect(updateBody!['weeklyGoalMinutes'], isNull);
      verify(
        () => apiClient.patchJson(
          '/api/v1/workspaces/ws_1/time-tracking/goals/goal-1',
          any(),
        ),
      ).called(1);
    });
  });
}
