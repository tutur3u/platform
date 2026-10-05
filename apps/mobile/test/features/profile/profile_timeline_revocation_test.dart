import 'dart:async';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/profile/profile_timeline_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends ApiClient {
  ApiException? failure;
  String actor = 'owner';
  String id = 'private';
  @override
  void checkUser(String userId) {
    if (userId != actor) throw StateError('Actor changed');
  }

  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    if (failure case final ApiException error) throw error;
    return {
      'items': [
        {
          'id': id,
          'type': 'task',
          'createdAt': '2026-10-01T00:00:00Z',
          'scope': 'personal',
        },
      ],
      'partial': false,
      'limited': false,
    };
  }
}

void main() {
  late Directory directory;
  late _Storage storage;
  late _Api api;
  late CacheStore store;
  late ProfileTimelineRepository repository;
  late Map<String, String?> values;
  var failReads = false;
  var failWrites = false;
  var failDeletes = false;
  Completer<void>? markerDeleteEntered;
  Completer<void>? markerDeleteRelease;

  void makeRepository() {
    repository = ProfileTimelineRepository(
      apiClient: api,
      cacheStore: store,
      secureStorage: storage,
    );
  }

  Future<void> restart() async {
    repository.dispose();
    await store.closeForTesting();
    await Hive.close();
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    makeRepository();
  }

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('timeline-revocation-');
    storage = _Storage();
    api = _Api();
    values = {};
    failReads = failWrites = failDeletes = false;
    markerDeleteEntered = markerDeleteRelease = null;
    when(() => storage.read(key: any(named: 'key'))).thenAnswer((call) async {
      final key = call.namedArguments[#key] as String;
      if (key.startsWith('profile-timeline-') && failReads) {
        throw StateError('Marker read failed');
      }
      return values[key];
    });
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      final key = call.namedArguments[#key] as String;
      if (key.startsWith('profile-timeline-') && failWrites) {
        throw StateError('Marker write failed');
      }
      values[key] = call.namedArguments[#value] as String?;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      final key = call.namedArguments[#key] as String;
      if (key.startsWith('profile-timeline-')) {
        if (failDeletes) throw StateError('Marker delete failed');
        if (markerDeleteEntered case final Completer<void> entered) {
          if (!entered.isCompleted) entered.complete();
          await markerDeleteRelease!.future;
        }
      }
      values.remove(key);
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    makeRepository();
    await repository.refresh('personal', 'owner');
  });

  tearDown(() async {
    repository.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  for (final initializationFailure in [false, true]) {
    test('durable denial survives encrypted cache failure and restart '
        'init=$initializationFailure', () async {
      if (initializationFailure) {
        await store.closeForTesting();
        store = CacheStore.forTesting(
          secureStorage: storage,
          directoryResolver: () async =>
              throw StateError('Directory unavailable'),
        );
        repository.dispose();
        makeRepository();
      } else {
        // Real encrypted Hive box is closed before CacheStore.remove reaches
        // its delete. The stored private row remains on disk after failure.
        await Hive.box<dynamic>('offline_cache_v1').close();
      }
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      await expectLater(
        repository.refresh('personal', 'owner'),
        throwsA(isA<ApiException>()),
      );
      await restart();
      expect(repository.peek('personal', 'owner'), isNull);
      expect(await repository.cached('personal', 'owner'), isNull);
      // Inspect the real reopened encrypted box: denial suppresses retained
      // data even though physical deletion failed.
      await store.init();
      expect(Hive.box<dynamic>('offline_cache_v1').values, isNotEmpty);
      api.failure = null;
      await repository.refresh('personal', 'owner');
      await restart();
      expect(
        (await repository.cached('personal', 'owner'))!.items.single.id,
        'private',
      );
    });
  }

  test(
    'unchecked and unreadable marker never publishes a cached snapshot',
    () async {
      await restart();
      expect(repository.peek('personal', 'owner'), isNull);
      failReads = true;
      await expectLater(
        repository.cached('personal', 'owner'),
        throwsStateError,
      );
      expect(repository.peek('personal', 'owner'), isNull);
    },
  );

  test(
    'unknown stored marker denies history rather than authorizing it',
    () async {
      await Hive.box<dynamic>('offline_cache_v1').close();
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      await expectLater(
        repository.refresh('personal', 'owner'),
        throwsA(isA<ApiException>()),
      );
      final marker = values.keys.singleWhere(
        (key) => key.startsWith('profile-timeline-denied-'),
      );
      values[marker] = 'unknown-corrupt-marker';
      await restart();
      expect(await repository.cached('personal', 'owner'), isNull);
      expect(repository.peek('personal', 'owner'), isNull);
    },
  );

  test(
    'marker-clear failure keeps revoked encrypted snapshot blocked on restart',
    () async {
      await Hive.box<dynamic>('offline_cache_v1').close();
      api.failure = const ApiException(message: 'Denied', statusCode: 401);
      await expectLater(
        repository.refresh('personal', 'owner'),
        throwsA(isA<ApiException>()),
      );
      await restart();
      api.failure = null;
      failDeletes = true;
      await expectLater(
        repository.refresh('personal', 'owner'),
        throwsStateError,
      );
      await restart();
      expect(await repository.cached('personal', 'owner'), isNull);
    },
  );

  test(
    'failed fresh snapshot write cannot clear a durable denial marker',
    () async {
      await Hive.box<dynamic>('offline_cache_v1').close();
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      await expectLater(
        repository.refresh('personal', 'owner'),
        throwsA(isA<ApiException>()),
      );
      await restart();
      await store.init();
      await Hive.box<dynamic>('offline_cache_v1').close();
      api
        ..failure = null
        ..id = 'fresh-online';
      final fresh = await repository.refresh('personal', 'owner');
      expect(fresh.items.single.id, 'fresh-online');
      expect(repository.peek('personal', 'owner'), isNull);
      expect(await repository.cached('personal', 'owner'), isNull);
      await restart();
      expect(await repository.cached('personal', 'owner'), isNull);
      expect(repository.peek('personal', 'owner'), isNull);
      await store.init();
      // The write failed in the real closed encrypted box, so its old private
      // record still exists. Only confirmed persistence may lift the marker.
      expect(
        Hive.box<dynamic>('offline_cache_v1').values.toString(),
        contains('private'),
      );
      expect(
        Hive.box<dynamic>('offline_cache_v1').values.toString(),
        isNot(contains('fresh-online')),
      );
    },
  );

  test(
    'both persistence and deletion failures are reported, not called durable',
    () async {
      await Hive.box<dynamic>('offline_cache_v1').close();
      failWrites = true;
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      await expectLater(
        repository.refresh('personal', 'owner'),
        throwsA(
          isA<ApiException>().having(
            (e) => e.code,
            'code',
            'TIMELINE_CACHE_REVOCATION_FAILED',
          ),
        ),
      );
      expect(repository.peek('personal', 'owner'), isNull);
      expect(await repository.cached('personal', 'owner'), isNull);
    },
  );

  test('pending marker clear cannot erase a subsequent denial', () async {
    markerDeleteEntered = Completer<void>();
    markerDeleteRelease = Completer<void>();
    final refresh = repository.refresh('personal', 'owner');
    final refreshResult = expectLater(refresh, throwsFormatException);
    await markerDeleteEntered!.future;
    api.failure = const ApiException(message: 'Denied', statusCode: 403);
    final denial = repository.refresh('personal', 'owner');
    final denialResult = expectLater(denial, throwsA(isA<ApiException>()));
    markerDeleteRelease!.complete();
    await refreshResult;
    await denialResult;
    await restart();
    expect(await repository.cached('personal', 'owner'), isNull);
  });

  test(
    'actor change during marker clear cannot publish fresh actor data',
    () async {
      markerDeleteEntered = Completer<void>();
      markerDeleteRelease = Completer<void>();
      final refresh = repository.refresh('personal', 'owner');
      final result = expectLater(refresh, throwsStateError);
      await markerDeleteEntered!.future;
      api.actor = 'other';
      markerDeleteRelease!.complete();
      await result;
      expect(
        repository.peek('personal', 'owner'),
        isNotNull,
      ); // Previously authorized snapshot, not a new publication.
    },
  );
}
