import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/notes/voice/notes_voice_job.dart';
import 'package:mobile/features/notes/voice/notes_voice_repository.dart';
import 'package:mocktail/mocktail.dart';

class Api extends Mock implements ApiClient {}

class Cache extends Mock implements CacheStore {}

void main() {
  late Api api;
  late Cache cache;
  late NotesVoiceRepository repository;
  setUpAll(() {
    registerFallbackValue(const CacheKey(namespace: 'test'));
    registerFallbackValue(CachePolicies.detail);
  });
  setUp(() {
    api = Api();
    cache = Cache();
    when(
      () => cache.remove(any(), checkScope: any(named: 'checkScope')),
    ).thenAnswer((_) async {});
    when(
      () => cache.invalidateTags(
        any(),
        userId: any(named: 'userId'),
        workspaceId: any(named: 'workspaceId'),
      ),
    ).thenAnswer((_) async {});
    when(
      () => cache.write(
        key: any(named: 'key'),
        policy: any(named: 'policy'),
        payload: any(named: 'payload'),
        tags: any(named: 'tags'),
        checkScope: any(named: 'checkScope'),
      ),
    ).thenAnswer((_) async {});
    repository = NotesVoiceRepository(
      api: api,
      cache: cache,
      actor: () => 'actor',
    );
  });
  test(
    'save uses stable Note ID and plain text, without creating tasks',
    () async {
      const job = NotesVoiceJob(
        id: 'intent',
        workspaceId: 'ws',
        status: 'completed',
        revision: 4,
        transcript: '<script>not markup</script>',
        artifact: {
          'title': 'Review',
          'summary': 'Summary',
          'actionItems': [
            {
              'task': 'Discuss',
              'owner': null,
              'dueDate': null,
              'evidence': 'Discuss it',
            },
          ],
        },
      );
      when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
      await repository.saveReviewed('actor', 'ws', job, 'Untitled');
      final call =
          verify(
                () => api.postJson('/api/v1/workspaces/ws/notes', captureAny()),
              ).captured.single
              as Map;
      expect(call['id'], 'intent');
      expect(call['title'], 'Review');
      expect(
        call['content'].toString(),
        contains('<script>not markup</script>'),
      );
      verify(
        () => cache.invalidateTags(
          ['module:notes'],
          userId: 'actor',
          workspaceId: 'ws',
        ),
      ).called(1);
      verifyNoMoreInteractions(api);
    },
  );
  test(
    'saving is blocked before network when the signed-in actor changed',
    () async {
      await expectLater(
        repository.saveReviewed(
          'other',
          'ws',
          const NotesVoiceJob(
            id: 'job',
            workspaceId: 'ws',
            status: 'completed',
            revision: 4,
            transcript: 'Private',
          ),
          'Untitled',
        ),
        throwsA(isA<ApiException>()),
      );
      verifyZeroInteractions(api);
    },
  );
  test('denial erases private snapshot; MFA and transport retain it', () async {
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException(message: 'denied', statusCode: 403));
    await expectLater(
      repository.refresh('actor', 'ws', 'job'),
      throwsA(isA<ApiException>()),
    );
    final key =
        verify(
              () => cache.remove(
                captureAny(),
                checkScope: any(named: 'checkScope'),
              ),
            ).captured.single
            as CacheKey;
    expect(key.userId, 'actor');
    expect(key.workspaceId, 'ws');
    clearInteractions(cache);
    when(() => api.getJson(any())).thenThrow(
      const ApiException(
        message: 'verify',
        statusCode: 403,
        isVerificationRequired: true,
      ),
    );
    await expectLater(
      repository.refresh('actor', 'ws', 'job'),
      throwsA(isA<ApiException>()),
    );
    verifyNever(
      () => cache.remove(any(), checkScope: any(named: 'checkScope')),
    );
    when(
      () => api.getJson(any()),
    ).thenThrow(const ApiException.transport(message: 'offline'));
    await expectLater(
      repository.refresh('actor', 'ws', 'job'),
      throwsA(isA<ApiException>()),
    );
    verifyNever(
      () => cache.remove(any(), checkScope: any(named: 'checkScope')),
    );
  });
  test(
    'away-and-back scope fences old response before cache publication',
    () async {
      final pending = Completer<Map<String, dynamic>>();
      when(() => api.getJson(any())).thenAnswer((_) => pending.future);
      final request = repository.refresh('actor', 'ws', 'job');
      repository.invalidateScope();
      pending.complete({
        'id': 'job',
        'wsId': 'ws',
        'status': 'completed',
        'revision': 4,
        'transcript': 'Old',
      });
      await expectLater(request, throwsA(isA<ApiException>()));
      verifyZeroInteractions(cache);
    },
  );
  test(
    'request intent is durable before dispatch, with no recording bytes cached',
    () async {
      final order = <String>[];
      when(
        () => cache.write(
          key: any(named: 'key'),
          policy: any(named: 'policy'),
          payload: any(named: 'payload'),
          tags: any(named: 'tags'),
          checkScope: any(named: 'checkScope'),
        ),
      ).thenAnswer((_) async {
        order.add('cache');
      });
      when(
        () => api.sendMultipart(
          'POST',
          any(),
          fields: any(named: 'fields'),
          files: any(named: 'files'),
        ),
      ).thenAnswer((_) async {
        order.add('dispatch');
        throw const ApiException.transport(message: 'offline');
      });
      await expectLater(
        repository.submit(
          'actor',
          'ws',
          requestId: 'intent',
          audio: Uint8List.fromList([1, 2]),
          timezone: 'UTC',
        ),
        throwsA(isA<ApiException>()),
      );
      expect(order, ['cache', 'dispatch']);
      final payload =
          verify(
                () => cache.write(
                  key: any(named: 'key'),
                  policy: any(named: 'policy'),
                  payload: captureAny(named: 'payload'),
                  tags: any(named: 'tags'),
                  checkScope: any(named: 'checkScope'),
                ),
              ).captured.single
              as Map;
      expect(payload['id'], 'intent');
      expect(payload['status'], 'pending');
      expect(payload.keys, isNot(contains('audio')));
    },
  );
  for (final status in [401, 403, 404]) {
    test('DELETE $status erases only its scoped cache key', () async {
      when(
        () => api.deleteJson(any()),
      ).thenThrow(ApiException(message: 'denied', statusCode: status));
      await expectLater(
        repository.delete('actor', 'ws', 'job'),
        throwsA(isA<ApiException>()),
      );
      final captured = verify(
        () => cache.remove(
          captureAny(),
          checkScope: captureAny(named: 'checkScope'),
        ),
      ).captured;
      final key = captured[0] as CacheKey;
      expect(key.userId, 'actor');
      expect(key.workspaceId, 'ws');
      repository.invalidateScope();
      expect(captured[1] as void Function(), throwsA(isA<ApiException>()));
    });
  }
  for (final failure in [
    const ApiException.transport(message: 'offline'),
    const ApiException(
      message: 'MFA code',
      statusCode: 403,
      code: 'MFA_REQUIRED',
    ),
    const ApiException(
      message: 'MFA',
      statusCode: 403,
      isVerificationRequired: true,
    ),
  ]) {
    test('temporary or MFA DELETE does not erase cache: $failure', () async {
      when(() => api.deleteJson(any())).thenThrow(failure);
      await expectLater(
        repository.delete('actor', 'ws', 'job'),
        throwsA(isA<ApiException>()),
      );
      verifyNever(
        () => cache.remove(any(), checkScope: any(named: 'checkScope')),
      );
    });
  }
  test(
    'code-only MFA on GET or POST never purges the scoped snapshot',
    () async {
      const challenge = ApiException(
        message: 'MFA',
        statusCode: 403,
        code: 'MFA_REQUIRED',
      );
      when(() => api.getJson(any())).thenThrow(challenge);
      await expectLater(
        repository.refresh('actor', 'ws', 'job'),
        throwsA(isA<ApiException>()),
      );
      when(
        () => api.sendMultipart(
          any(),
          any(),
          fields: any(named: 'fields'),
          files: any(named: 'files'),
        ),
      ).thenThrow(challenge);
      await expectLater(
        repository.submit(
          'actor',
          'ws',
          requestId: 'job',
          audio: Uint8List.fromList([1]),
          timezone: 'UTC',
        ),
        throwsA(isA<ApiException>()),
      );
      verifyNever(
        () => cache.remove(any(), checkScope: any(named: 'checkScope')),
      );
    },
  );
}
