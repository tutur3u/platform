import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

class _SecureStorage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late CacheStore store;
  late OfflineMutationQueue queue;
  late StreamController<List<ConnectivityResult>> connectivity;
  late StreamController<supa.AuthState> auth;
  late bool online;
  late String actor;
  late List<PendingMutationRecord> sent;

  Future<bool> admit(ApiException error, {bool replaySafe = true}) =>
      queue.enqueueAfterNetworkFailure(
        error: error,
        feature: 'notes',
        method: 'PUT',
        path: '/api/v1/workspaces/synthetic-ws/notes/synthetic-note',
        workspaceId: 'synthetic-ws',
        payload: const {'title': 'Synthetic edit'},
        entityId: 'synthetic-note',
        replaySafe: replaySafe,
      );

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mutation-admission-');
    final secureStorage = _SecureStorage();
    final secrets = <String, String>{};
    when(
      () => secureStorage.read(key: any(named: 'key')),
    ).thenAnswer((call) async => secrets[call.namedArguments[#key] as String]);
    when(
      () => secureStorage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((call) async {
      secrets[call.namedArguments[#key] as String] =
          call.namedArguments[#value] as String;
    });
    store = CacheStore.forTesting(
      secureStorage: secureStorage,
      directoryResolver: () async => directory,
    );
    online = false;
    actor = 'synthetic-user';
    sent = [];
    connectivity = StreamController<List<ConnectivityResult>>.broadcast();
    auth = StreamController<supa.AuthState>.broadcast();
    queue = OfflineMutationQueue.forTesting(
      store: store,
      userId: () => actor,
      checkConnectivity: () async => [
        if (online) ConnectivityResult.wifi else ConnectivityResult.none,
      ],
      connectivityChanges: connectivity.stream,
      authChanges: auth.stream,
    );
    await queue.init();
    queue.registerDispatcher('notes', (record) async => sent.add(record));
    await queue.synchronize();
  });

  tearDown(() async {
    await queue.synchronize();
    await queue.dispose();
    await connectivity.close();
    await auth.close();
    await store.closeForTesting();
    await Hive.close();
    directory.deleteSync(recursive: true);
  });

  PendingMutationRecord notificationRead(
    String id, {
    PendingMutationStatus status = PendingMutationStatus.queued,
    int order = 0,
  }) => PendingMutationRecord(
    id: 'mutation-$id',
    feature: 'notifications',
    method: 'PATCH',
    path: '/api/v1/notifications/$id',
    payload: const {'read': true},
    optimisticPatch: {'entityId': id},
    userId: actor,
    workspaceId: 'personal',
    createdAt: DateTime.utc(2026, 1, 1, 0, order),
    status: status,
  );

  test(
    'opening notifications retires a removed row and unblocks the next read',
    () async {
      queue.registerDispatcher('notifications', (record) async {
        sent.add(record);
        if (record.entityId == 'gone') {
          throw const ApiException(
            statusCode: 404,
            message: 'Notification not found',
          );
        }
      });
      await queue.enqueue(
        notificationRead('gone', status: PendingMutationStatus.conflict),
      );
      await queue.enqueue(notificationRead('next', order: 1));
      await queue.synchronize();
      online = true;
      await queue.syncOnViewOpen('notifications');
      expect(sent.map((record) => record.entityId), ['gone', 'next']);
      expect(await queue.listPending(), isEmpty);
    },
  );

  test('resuming the app drains persisted notification reads', () async {
    final synced = Completer<void>();
    queue.registerDispatcher('notifications', (record) async {
      sent.add(record);
    });
    await queue.enqueue(notificationRead('resume'));
    await queue.synchronize();
    void recordSync() {
      if (queue.pending.value.isEmpty && !synced.isCompleted) {
        synced.complete();
      }
    }

    queue.pending.addListener(recordSync);
    online = true;
    queue.didChangeAppLifecycleState(AppLifecycleState.resumed);
    try {
      await synced.future.timeout(const Duration(seconds: 5));
      expect(sent.map((record) => record.entityId), ['resume']);
    } finally {
      queue.pending.removeListener(recordSync);
    }
  });

  test(
    'repeated server failures stop replay and allow a manual retry',
    () async {
      var available = false;
      queue.registerDispatcher('notifications', (record) async {
        sent.add(record);
        if (!available) {
          throw const ApiException(statusCode: 503, message: 'Unavailable');
        }
      });
      await queue.enqueue(notificationRead('retry'));
      await queue.synchronize();
      online = true;
      for (var attempt = 0; attempt < 5; attempt++) {
        await queue.drain();
      }
      expect(sent, hasLength(4));
      final failed = (await queue.listPending()).single;
      expect(failed.status, PendingMutationStatus.failed);
      available = true;
      await queue.retry(failed.id);
      expect(sent, hasLength(5));
      expect(await queue.listPending(), isEmpty);
    },
  );

  test(
    'model write cannot enqueue for a departed actor while offline',
    () async {
      var pendingCreated = false;
      await expectLater(
        queueOrSendValue<String>(
          feature: 'crm',
          method: 'CRM_BULK_IMPORT',
          path: '/api/v1/workspaces/synthetic-ws/users/bulk',
          workspaceId: 'synthetic-ws',
          expectedUserId: 'departed-user',
          queue: queue,
          send: () async => 'sent',
          pendingValue: (_) {
            pendingCreated = true;
            return 'pending';
          },
        ),
        throwsA(isA<StateError>()),
      );
      expect(pendingCreated, isFalse);
      expect(await queue.listPending(), isEmpty);
    },
  );

  test(
    'model write cannot enqueue failed transport for a departed actor',
    () async {
      online = true;
      await expectLater(
        queueOrSendValue<String>(
          feature: 'crm',
          method: 'PUT',
          path: '/api/v1/workspaces/synthetic-ws/users/customer',
          workspaceId: 'synthetic-ws',
          expectedUserId: 'synthetic-user',
          queue: queue,
          send: () async {
            actor = 'new-user';
            throw const ApiException.transport(
              message: 'Synthetic lost connection',
            );
          },
          pendingValue: (_) => 'pending',
        ),
        throwsA(isA<StateError>()),
      );
      expect(await queue.listPending(), isEmpty);
    },
  );

  for (final kind in [
    ApiFailureKind.session,
    ApiFailureKind.response,
    ApiFailureKind.unknown,
    ApiFailureKind.http,
  ]) {
    final error = ApiException(
      message: 'Synthetic $kind failure',
      statusCode: 0,
      failureKind: kind,
    );
    test('$kind status zero is neither persisted nor replayed', () async {
      expect(await admit(error), isFalse);
      expect(await queue.listPending(), isEmpty);
      online = true;
      await queue.drain();
      expect(sent, isEmpty);
    });

    test(
      'shared write helpers surface $kind without a pending result',
      () async {
        online = true;
        await expectLater(
          queueOrSendVoid(
            feature: 'notes',
            method: 'PUT',
            path: '/api/v1/workspaces/synthetic-ws/notes/synthetic-note',
            workspaceId: 'synthetic-ws',
            replaySafe: true,
            queue: queue,
            send: () async => throw error,
          ),
          throwsA(same(error)),
        );
        var pendingResult = false;
        await expectLater(
          queueOrSendValue<String>(
            feature: 'notes',
            method: 'PUT',
            path: '/api/v1/workspaces/synthetic-ws/notes/synthetic-note',
            workspaceId: 'synthetic-ws',
            replaySafe: true,
            queue: queue,
            send: () async => throw error,
            pendingValue: (_) {
              pendingResult = true;
              return 'pending';
            },
          ),
          throwsA(same(error)),
        );
        expect(pendingResult, isFalse);
        expect(await queue.listPending(), isEmpty);
        await queue.drain();
        expect(sent, isEmpty);
      },
    );
  }

  for (final error in [
    const ApiException.transport(message: 'Synthetic connection lost'),
    const ApiException(
      message: 'Synthetic offline contract unavailable',
      statusCode: 503,
      code: 'OFFLINE_CONTRACT_UNAVAILABLE',
    ),
  ]) {
    test(
      '${error.failureKind}/${error.code} replay-safe admission replays once',
      () async {
        expect(await admit(error), isTrue);
        final pending = (await queue.listPending()).single;
        expect(pending.status, PendingMutationStatus.queued);
        expect(pending.userId, 'synthetic-user');
        expect(pending.workspaceId, 'synthetic-ws');
        online = true;
        await queue.drain();
        expect(sent, hasLength(1));
        expect(sent.single.id, pending.id);
        expect(await queue.listPending(), isEmpty);
      },
    );
  }

  test(
    'uncertain non-idempotent transport stays manual, never auto-replays',
    () async {
      expect(
        await admit(
          const ApiException.transport(message: 'Synthetic uncertain send'),
          replaySafe: false,
        ),
        isTrue,
      );
      expect(
        (await queue.listPending()).single.status,
        PendingMutationStatus.conflict,
      );
      online = true;
      await queue.drain();
      expect(sent, isEmpty);
      expect(await queue.listPending(), hasLength(1));
    },
  );

  test(
    'offline contract exemption still requires replay-safe semantics',
    () async {
      expect(
        await admit(
          const ApiException(
            message: 'Synthetic offline contract unavailable',
            statusCode: 503,
            code: 'OFFLINE_CONTRACT_UNAVAILABLE',
          ),
          replaySafe: false,
        ),
        isFalse,
      );
      expect(await queue.listPending(), isEmpty);
    },
  );
}
