import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/notes/voice/notes_voice_repository.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends ApiClient {
  ApiException? failure;
  String id = 'private';
  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    if (failure case final ApiException error) throw error;
    return {
      'id': id,
      'wsId': 'ws',
      'status': 'completed',
      'revision': 4,
      'transcript': 'Private words',
      'artifact': {'title': 'Private'},
    };
  }

  @override
  Future<Map<String, dynamic>> sendMultipart(
    String method,
    String path, {
    Map<String, String>? fields,
    List<ApiMultipartFile> files = const [],
    bool requiresAuth = true,
  }) async => throw failure!;
}

void main() {
  late Directory directory;
  late _Storage storage;
  late _Api api;
  late CacheStore store;
  late NotesVoiceRepository repository;
  late Map<String, String?> values;
  var failReads = false;
  var failWrites = false;
  var failDeletes = false;
  var actor = 'owner';
  Completer<void>? markerEntered;
  Completer<void>? markerRelease;

  void makeRepository() {
    repository = NotesVoiceRepository(
      api: api,
      cache: store,
      secureStorage: storage,
      actor: () => actor,
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
    directory = await Directory.systemTemp.createTemp('notes-revocation-');
    storage = _Storage();
    api = _Api();
    values = {};
    failReads = failWrites = failDeletes = false;
    actor = 'owner';
    markerEntered = markerRelease = null;
    when(() => storage.read(key: any(named: 'key'))).thenAnswer((call) async {
      final key = call.namedArguments[#key] as String;
      if (key.startsWith('notes-voice-') && failReads) {
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
      if (key.startsWith('notes-voice-')) {
        if (failWrites) throw StateError('Marker write failed');
        if (markerEntered case final Completer<void> entered) {
          if (!entered.isCompleted) entered.complete();
          await markerRelease!.future;
        }
      }
      values[key] = call.namedArguments[#value] as String?;
    });
    when(() => storage.delete(key: any(named: 'key'))).thenAnswer((call) async {
      final key = call.namedArguments[#key] as String;
      if (key.startsWith('notes-voice-') && failDeletes) {
        throw StateError('Marker delete failed');
      }
      values.remove(key);
    });
    store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => directory,
    );
    makeRepository();
    await repository.refresh('owner', 'ws', 'private');
  });

  tearDown(() async {
    repository.dispose();
    await store.closeForTesting();
    await Hive.close();
    await directory.delete(recursive: true);
  });

  for (final initializationFailure in [false, true]) {
    test('denial survives real cache failure and restart '
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
        await Hive.box<dynamic>('offline_cache_v1').close();
      }
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      await expectLater(
        repository.refresh('owner', 'ws', 'private'),
        throwsA(isA<ApiException>().having((e) => e.statusCode, 'status', 403)),
      );
      await restart();
      expect(await repository.cached('owner', 'ws'), isNull);
      await store.init();
      expect(Hive.box<dynamic>('offline_cache_v1').values, isNotEmpty);
      api.failure = null;
      await repository.refresh('owner', 'ws', 'private');
      await restart();
      expect(
        (await repository.cached('owner', 'ws'))!.transcript,
        'Private words',
      );
    });
  }

  test(
    'required publication rejects stale admission; default remains a no-op',
    () async {
      const key = CacheKey(
        namespace: 'notes.voice.latest',
        userId: 'owner',
        workspaceId: 'ws',
      );
      final staleRevision = store.resourceRevisionFor(key);
      await store.invalidateTags(
        ['module:notes'],
        userId: 'owner',
        workspaceId: 'ws',
      );
      await expectLater(
        store.write(
          key: key,
          policy: CachePolicies.detail,
          payload: {'private': 'new'},
          expectedRevision: staleRevision,
          requirePublication: true,
        ),
        throwsStateError,
      );
      await store.write(
        key: key,
        policy: CachePolicies.detail,
        payload: {'private': 'new'},
        expectedRevision: staleRevision,
      );
      expect(
        (await repository.cached('owner', 'ws'))!.transcript,
        'Private words',
      );
    },
  );

  test(
    'unreadable marker cannot authorize a retained private snapshot',
    () async {
      await restart();
      failReads = true;
      await expectLater(repository.cached('owner', 'ws'), throwsStateError);
    },
  );

  test('failed fresh publication does not remove denial marker', () async {
    api.failure = const ApiException(message: 'Denied', statusCode: 403);
    await expectLater(
      repository.refresh('owner', 'ws', 'private'),
      throwsA(isA<ApiException>()),
    );
    await Hive.box<dynamic>('offline_cache_v1').close();
    api.failure = null;
    await expectLater(
      repository.refresh('owner', 'ws', 'private'),
      throwsA(isA<Object>()),
    );
    await restart();
    expect(await repository.cached('owner', 'ws'), isNull);
  });

  test(
    'pending intent and MFA challenge cannot authorize a revoked snapshot',
    () async {
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      await expectLater(
        repository.refresh('owner', 'ws', 'private'),
        throwsA(isA<ApiException>()),
      );
      api.failure = const ApiException(
        message: 'Verify',
        statusCode: 403,
        code: 'MFA_REQUIRED',
      );
      await expectLater(
        repository.submit(
          'owner',
          'ws',
          requestId: 'new-intent',
          audio: Uint8List(1),
          timezone: 'UTC',
        ),
        throwsA(isA<ApiException>()),
      );
      await restart();
      expect(await repository.cached('owner', 'ws'), isNull);
    },
  );

  test('MFA preserves the last authorized snapshot across restart', () async {
    api.failure = const ApiException(
      message: 'Verify',
      statusCode: 403,
      code: 'MFA_REQUIRED',
    );
    await expectLater(
      repository.refresh('owner', 'ws', 'private'),
      throwsA(isA<ApiException>()),
    );
    await restart();
    expect(
      (await repository.cached('owner', 'ws'))!.transcript,
      'Private words',
    );
  });

  test(
    'both persistence failures preserve denial type and block current reads',
    () async {
      failWrites = true;
      await Hive.box<dynamic>('offline_cache_v1').close();
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      await expectLater(
        repository.refresh('owner', 'ws', 'private'),
        throwsA(
          isA<ApiException>()
              .having((e) => e.statusCode, 'status', 403)
              .having(
                (e) => e.code,
                'code',
                'NOTES_VOICE_CACHE_REVOCATION_FAILED',
              ),
        ),
      );
      expect(await repository.cached('owner', 'ws'), isNull);
    },
  );

  test(
    'old denial marker completes before newer authorized publication',
    () async {
      markerEntered = Completer<void>();
      markerRelease = Completer<void>();
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      final denied = repository.refresh('owner', 'ws', 'private');
      final denialChecked = expectLater(denied, throwsA(isA<ApiException>()));
      await markerEntered!.future;
      actor = 'other';
      repository.invalidateScope();
      actor = 'owner';
      repository.invalidateScope();
      api.failure = null;
      final fresh = repository.refresh('owner', 'ws', 'private');
      markerRelease!.complete();
      await denialChecked;
      await fresh;
      await restart();
      expect(
        (await repository.cached('owner', 'ws'))!.transcript,
        'Private words',
      );
    },
  );

  test(
    'marker deletion failure leaves durable denial closed after restart',
    () async {
      api.failure = const ApiException(message: 'Denied', statusCode: 403);
      await expectLater(
        repository.refresh('owner', 'ws', 'private'),
        throwsA(isA<ApiException>()),
      );
      api.failure = null;
      failDeletes = true;
      await expectLater(
        repository.refresh('owner', 'ws', 'private'),
        throwsStateError,
      );
      await restart();
      expect(await repository.cached('owner', 'ws'), isNull);
    },
  );
}
