import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/meet_cache.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mail/data/mail_cache.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  late Directory directory;
  late CacheStore store;

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('cache-failure-test-');
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
    );
  });

  tearDown(() async {
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  test(
    'a failed cache write preserves the successful network response',
    () async {
      var calls = 0;
      final result = await store.prefetch<String>(
        key: const CacheKey(namespace: 'meet.list', userId: 'user'),
        policy: CachePolicies.moduleData,
        decode: (value) => value! as String,
        fetch: () async {
          calls++;
          await Hive.box<dynamic>('offline_cache_v1').close();
          return 'network result';
        },
      );
      expect(result.data, 'network result');
      expect(result.hasValue, isTrue);
      expect(calls, 1);
    },
  );

  for (final useMail in [false, true]) {
    test(
      '${useMail ? 'Mail' : 'Meet'} preserves denial after purge failure',
      () async {
        final meet = MeetCache(store: store, currentUserId: () => 'user');
        final mail = MailCache(store: store, currentUserId: () => 'user');
        Future<Map<String, dynamic>> read(
          Future<Map<String, dynamic>> Function() fetch,
        ) => useMail
            ? mail.read('workspace', 'page', fetch, forceRefresh: true)
            : meet.read('workspace', 'page', fetch, forceRefresh: true);
        await read(() async => {'meetings': <dynamic>[], 'totalCount': 1});
        const denied = ApiException(message: 'Denied', statusCode: 403);
        await expectLater(
          read(() async {
            await Hive.box<dynamic>('offline_cache_v1').close();
            throw denied;
          }),
          throwsA(same(denied)),
        );
        expect(
          useMail
              ? mail.peek('workspace', 'page')
              : meet.peek('workspace', 'page'),
          isNull,
        );
        var calls = 0;
        final result = await read(() async {
          calls++;
          return {'totalCount': 2};
        });
        expect(calls, 1);
        expect(result['totalCount'], 2);
      },
    );
  }
}
