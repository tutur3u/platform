import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/meet_cache.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  test(
    'Meet reuses reads, isolates workspaces, and purges denied access',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'meet-cache-test-',
      );
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
      final store = CacheStore.forTesting(
        secureStorage: storage,
        directoryResolver: () async => directory,
      );
      addTearDown(() async {
        await store.closeForTesting();
        await Hive.close();
        await directory.delete(recursive: true);
      });
      var user = 'a';
      final cache = MeetCache(store: store, currentUserId: () => user);
      var calls = 0;
      Future<Map<String, dynamic>> fetch() async {
        calls++;
        return {'meetings': <dynamic>[], 'totalCount': 2};
      }

      await cache.read('first', 'page1', fetch, forceRefresh: false);
      await cache.read('first', 'page1', fetch, forceRefresh: false);
      expect(calls, 1);
      expect(cache.peek('first', 'page1')?.totalCount, 2);
      expect(cache.peek('second', 'page1'), isNull);
      await cache.read('second', 'page1', fetch, forceRefresh: false);
      await expectLater(
        cache.read('first', 'page1', () async {
          throw const ApiException(message: 'Denied', statusCode: 403);
        }, forceRefresh: true),
        throwsA(isA<ApiException>()),
      );
      expect(cache.peek('first', 'page1'), isNull);
      expect(cache.peek('second', 'page1')?.totalCount, 2);
      await cache.invalidate('second');
      await cache.read('second', 'page1', fetch, forceRefresh: false);
      expect(calls, 3);
      user = 'b';
      expect(cache.peek('second', 'page1'), isNull);
    },
  );
}
