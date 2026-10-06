import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _PausedSnapshot extends MailCache {
  _PausedSnapshot({
    required CacheStore store,
    required String? Function() actor,
  }) : super(store: store, currentUserId: actor);

  final started = Completer<void>();
  final release = Completer<void>();

  @override
  Future<Map<String, dynamic>?> snapshot(String wsId, String path) async {
    final result = await super.snapshot(wsId, path);
    started.complete();
    await release.future;
    return result;
  }
}

void main() {
  late Directory directory;
  late CacheStore store;
  var actor = 'actor';
  var failInitialization = false;
  FutureOr<void> Function(String)? checkpoint;

  setUp(() async {
    actor = 'actor';
    failInitialization = false;
    checkpoint = null;
    directory = await Directory.systemTemp.createTemp('mail-error-scope-');
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
      directoryResolver: () async {
        if (failInitialization) throw StateError('Synthetic unavailable cache');
        return directory;
      },
      persistenceCheckpoint: (stage) => checkpoint?.call(stage),
    );
  });

  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test(
    'transient fallback cannot publish across an awaited snapshot ABA',
    () async {
      final cache = _PausedSnapshot(store: store, actor: () => actor);
      await cache.read('ws', 'inbox', () async => {'version': 'old'});
      final pending = cache.read(
        'ws',
        'inbox',
        () async =>
            throw const ApiException(message: 'Synthetic', statusCode: 503),
        forceRefresh: true,
      );
      final check = expectLater(pending, throwsStateError);
      await cache.started.future;
      actor = 'other';
      await store.clearScope(userId: 'actor');
      actor = 'actor';
      final current = MailCache(store: store, currentUserId: () => actor);
      await current.read('ws', 'inbox', () async => {'version': 'new'});
      cache.release.complete();
      await check;
      expect(current.peek('ws', 'inbox')?['version'], 'new');
    },
  );

  test(
    'definitive denial performs one purge before a new session can publish',
    () async {
      var purges = 0;
      checkpoint = (stage) {
        if (stage == 'clear-intent') purges++;
      };
      final cache = MailCache(store: store, currentUserId: () => actor);
      await cache.read('ws', 'inbox', () async => {'version': 'old'});
      await expectLater(
        cache.read(
          'ws',
          'inbox',
          () async =>
              throw const ApiException(message: 'Denied', statusCode: 403),
          forceRefresh: true,
        ),
        throwsA(isA<ApiException>()),
      );
      expect(purges, 1);
      final current = MailCache(store: store, currentUserId: () => actor);
      await current.read('ws', 'inbox', () async => {'version': 'new'});
      expect(current.peek('ws', 'inbox')?['version'], 'new');
    },
  );

  for (final fails in [false, true]) {
    test(
      'cache-unavailable direct fetch fences delayed outcome fails=$fails',
      () async {
        failInitialization = true;
        final cache = MailCache(store: store, currentUserId: () => actor);
        final started = Completer<void>();
        final response = Completer<Map<String, dynamic>>();
        final pending = cache.read('ws', 'inbox', () {
          started.complete();
          return response.future;
        });
        final check = expectLater(pending, throwsStateError);
        await started.future;
        failInitialization = false;
        actor = 'other';
        await store.clearScope(userId: 'actor');
        actor = 'actor';
        final current = MailCache(store: store, currentUserId: () => actor);
        await current.read('ws', 'inbox', () async => {'version': 'new'});
        if (fails) {
          response.completeError(
            const ApiException(
              message: 'Late synthetic denial',
              statusCode: 403,
            ),
          );
        } else {
          response.complete({'version': 'old'});
        }
        await check;
        expect(current.peek('ws', 'inbox')?['version'], 'new');
        expect(cache.accessRevoked.value, isNull);
      },
    );
  }
}
