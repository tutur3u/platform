import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends ApiClient {
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async => {
    'items': [
      {
        'id': 'task',
        'type': 'task',
        'createdAt': '2026-09-30T10:00:00Z',
        'scope': 'personal',
      },
    ],
    'partial': true,
    'limited': true,
  };
}

void main() {
  late Directory directory;
  late CacheStore store;
  late _Storage storage;
  late Map<String, String?> secureValues;
  late ProfileTimelineRepository repository;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('profile-snapshot-');
    storage = _Storage();
    secureValues = {};
    when(
      () => storage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secureValues[call.namedArguments[#key]]);
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secureValues[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String?;
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    repository = ProfileTimelineRepository(
      apiClient: _Api(),
      cacheStore: store,
    );
  });
  tearDown(() async {
    repository.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });
  Future<void> reopen() async {
    repository.dispose();
    await store.closeForTesting();
    await Hive.close();
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    repository = ProfileTimelineRepository(
      apiClient: _Api(),
      cacheStore: store,
    );
  }

  test(
    'capped partial result retains completeness through encrypted cache',
    () async {
      final fresh = await repository.refresh('team', 'owner');
      final persistedKeys = Map<String, String?>.of(secureValues);
      expect(persistedKeys, isNotEmpty);
      await reopen();
      final cached = await repository.cached('team', 'owner');
      expect(secureValues, persistedKeys);
      expect(cached!.items.single.id, fresh.items.single.id);
      expect(cached.partial, isTrue);
      expect(cached.limited, isTrue);
      expect(await repository.cached('other-team', 'owner'), isNull);
      expect(await repository.cached('team', 'other-owner'), isNull);
    },
  );
  test(
    'legacy list snapshots remain readable without invented flags',
    () async {
      await store.write(
        key: const CacheKey(
          namespace: 'profile.timeline',
          workspaceId: 'team',
          userId: 'owner',
        ),
        policy: CachePolicies.summary,
        payload: [
          {
            'id': 'legacy',
            'type': 'task',
            'createdAt': '2026-09-30T10:00:00Z',
            'scope': 'personal',
          },
        ],
      );
      final persistedKeys = Map<String, String?>.of(secureValues);
      expect(persistedKeys, isNotEmpty);
      await reopen();
      final cached = await repository.cached('team', 'owner');
      expect(secureValues, persistedKeys);
      expect(cached!.items.single.id, 'legacy');
      expect(cached.partial, isFalse);
      expect(cached.limited, isFalse);
    },
  );
}
