import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

void main() {
  late CacheStore store;
  late MailCache cache;
  late _Api api;
  late MailRepository repository;
  late Directory directory;
  var actor = 'actor';
  FutureOr<void> Function(String)? checkpoint;

  setUp(() async {
    actor = 'actor';
    checkpoint = null;
    directory = await Directory.systemTemp.createTemp('mail-race-test-');
    final storage = _Storage();
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((_) async => null);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((_) async {});
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
      persistenceCheckpoint: (stage) => checkpoint?.call(stage),
    );
    await store.init();
    cache = MailCache(store: store, currentUserId: () => actor);
    api = _Api();
    repository = MailRepository(apiClient: api, cache: cache);
  });
  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  for (final detail in [false, true]) {
    for (final mutationFails in [false, true]) {
      test('delayed mark-read $mutationFails restarts detail=$detail '
          'with coalescing', () async {
        final first = Completer<Map<String, dynamic>>();
        final fresh = Completer<Map<String, dynamic>>();
        final started = Completer<void>();
        final restarted = Completer<void>();
        var calls = 0;
        when(() => api.getJson(any())).thenAnswer((_) {
          calls++;
          if (calls == 1) {
            started.complete();
            return first.future;
          }
          restarted.complete();
          return fresh.future;
        });
        final mutation = Completer<Map<String, dynamic>>();
        final mutationStarted = Completer<void>();
        when(() => api.patchJson(any(), any())).thenAnswer((_) {
          mutationStarted.complete();
          return mutation.future;
        });
        final write = repository.changeState(
          'ws',
          'box',
          'previous',
          'mark_read',
          thread: true,
        );
        final writeCheck = mutationFails
            ? expectLater(write, throwsA(isA<ApiException>()))
            : write;
        Future<Map<String, dynamic>> read() => detail
            ? repository.detail('ws', 'box', 'next', thread: true)
            : repository.list('ws', 'box', folder: 'inbox', forceRefresh: true);
        final left = read();
        final right = read();
        await started.future;
        await mutationStarted.future;
        if (mutationFails) {
          mutation.completeError(
            const ApiException(message: 'Synthetic failure', statusCode: 500),
          );
        } else {
          mutation.complete({});
        }
        await writeCheck;
        first.complete({'version': 'before-mutation'});
        await restarted.future;
        var completed = false;
        unawaited(
          left.then((_) {
            completed = true;
          }),
        );
        await Future<void>.delayed(Duration.zero);
        expect(completed, isFalse);
        fresh.complete({'version': 'current'});
        expect((await left)['version'], 'current');
        expect((await right)['version'], 'current');
        expect(calls, 2);
      });
    }
  }

  test('read entering during invalidation waits and restarts once', () async {
    await cache.read('ws', 'inbox', () async => {'version': 'stored'});
    final blocked = Completer<void>();
    final release = Completer<void>();
    checkpoint = (stage) async {
      if (stage == 'snapshot' && !blocked.isCompleted) {
        blocked.complete();
        await release.future;
      }
    };
    final blocker = store.write(
      key: const CacheKey(
        namespace: 'other',
        userId: 'actor',
        workspaceId: 'ws',
      ),
      policy: CachePolicies.detail,
      payload: {'safe': true},
    );
    await blocked.future;
    final mutation = cache.mutate('ws', () async {});
    // Let invalidation advance flight fences and wait at serialized storage.
    await Future<void>.delayed(Duration.zero);
    final fetched = Completer<void>();
    final response = Completer<Map<String, dynamic>>();
    var calls = 0;
    final pending = cache.read('ws', 'inbox', () {
      calls++;
      if (calls == 1) {
        fetched.complete();
        return response.future;
      }
      return Future.value({'version': 'current'});
    }, forceRefresh: true);
    await fetched.future;
    response.complete({'version': 'interrupted'});
    release.complete();
    await blocker;
    await mutation;
    expect((await pending)['version'], 'current');
    expect(calls, 2);
  });

  test('repeated invalidation is bounded to one restart', () async {
    final responses = [
      Completer<Map<String, dynamic>>(),
      Completer<Map<String, dynamic>>(),
    ];
    final starts = [Completer<void>(), Completer<void>()];
    var calls = 0;
    final pending = cache.read('ws', 'inbox', () {
      final index = calls++;
      starts[index].complete();
      return responses[index].future;
    });
    final check = expectLater(pending, throwsStateError);
    for (var index = 0; index < 2; index++) {
      await starts[index].future;
      await cache.mutate('ws', () async {});
      responses[index].complete({'version': index});
    }
    await check;
    expect(calls, 2);
    expect(cache.peek('ws', 'inbox'), isNull);
  });

  for (final boundary in ['denial', 'logout', 'workspace']) {
    test('mutation restart cannot survive $boundary', () async {
      final response = Completer<Map<String, dynamic>>();
      final started = Completer<void>();
      var calls = 0;
      final pending = cache.read('ws', 'inbox', () {
        calls++;
        started.complete();
        return response.future;
      });
      final check = expectLater(pending, throwsStateError);
      await started.future;
      await cache.mutate('ws', () async {});
      if (boundary == 'logout') {
        actor = 'other';
        await store.clearScope(userId: 'actor');
        actor = 'actor';
      } else if (boundary == 'workspace') {
        await store.clearScope(
          userId: 'actor',
          workspaceId: 'ws',
          namespace: 'mail.list',
        );
      } else {
        await cache.denyAccess('ws');
      }
      response.complete({'version': 'old-actor'});
      await check;
      expect(calls, 1);
      expect(cache.peek('ws', 'inbox'), isNull);
    });
  }

  test('another workspace mutation does not restart this read', () async {
    final response = Completer<Map<String, dynamic>>();
    final started = Completer<void>();
    var calls = 0;
    final pending = cache.read('ws', 'inbox', () {
      calls++;
      started.complete();
      return response.future;
    });
    await started.future;
    await cache.mutate('other', () async {});
    response.complete({'version': 'scoped'});
    expect((await pending)['version'], 'scoped');
    expect(calls, 1);
  });

  for (final status in [403, 503]) {
    test('late API $status cannot affect a new same-ID session', () async {
      final response = Completer<Map<String, dynamic>>();
      final started = Completer<void>();
      final pending = cache.read('ws', 'inbox', () {
        started.complete();
        return response.future;
      });
      final check = expectLater(pending, throwsStateError);
      await started.future;
      actor = 'other';
      await store.clearScope(userId: 'actor');
      actor = 'actor';
      final current = MailCache(store: store, currentUserId: () => actor);
      await current.read('ws', 'inbox', () async => {'version': 'new-session'});
      response.completeError(
        ApiException(message: 'Synthetic late failure', statusCode: status),
      );
      await check;
      expect(current.peek('ws', 'inbox')?['version'], 'new-session');
      expect(cache.accessRevoked.value, isNull);
    });
  }

  for (final status in [403, 404, 500]) {
    test('ordinary invalidation does not retry real API $status', () async {
      final response = Completer<Map<String, dynamic>>();
      final started = Completer<void>();
      var calls = 0;
      final pending = cache.read('ws', 'inbox', () {
        calls++;
        started.complete();
        return response.future;
      });
      final check = expectLater(pending, throwsA(isA<ApiException>()));
      await started.future;
      await cache.mutate('ws', () async {});
      response.completeError(
        ApiException(message: 'Synthetic failure', statusCode: status),
      );
      await check;
      expect(calls, 1);
    });
  }
}
