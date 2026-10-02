import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
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
  late String? userId;
  Future<void>? connectivityGate;
  var sequence = 0;

  PendingMutationRecord edit(
    String id, {
    String feature = 'notes',
    String user = 'user-1',
    bool replaySafe = true,
  }) => PendingMutationRecord(
    id: id,
    feature: feature,
    method: 'PUT',
    path: '/api/workspaces/ws-1/$feature/$id',
    createdAt: DateTime.utc(
      2026,
      10,
      2,
    ).add(Duration(microseconds: sequence++)),
    userId: user,
    workspaceId: 'ws-1',
    payload: const {'title': 'Offline edit'},
    replaySafe: replaySafe,
  );

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mobile-offline-sync-');
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
    userId = 'user-1';
    connectivityGate = null;
    connectivity = StreamController<List<ConnectivityResult>>.broadcast();
    auth = StreamController<supa.AuthState>.broadcast();
    queue = OfflineMutationQueue.forTesting(
      store: store,
      userId: () => userId,
      checkConnectivity: () async {
        await connectivityGate;
        return [
          if (online) ConnectivityResult.wifi else ConnectivityResult.none,
        ];
      },
      connectivityChanges: connectivity.stream,
      authChanges: auth.stream,
    );
    await queue.init();
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

  test('concurrent drains never dispatch the same edit twice', () async {
    var sends = 0;
    queue.registerDispatcher('notes', (_) async {
      sends++;
    });
    await queue.enqueue(edit('edit-1'));
    await queue.synchronize();
    final gate = Completer<void>();
    connectivityGate = gate.future;
    online = true;
    final drains = List.generate(12, (_) => queue.drain());
    gate.complete();
    await Future.wait(drains);
    expect(sends, 1);
    expect(await queue.listPending(), isEmpty);
  });

  test(
    'connectivity event replays persisted edits and refreshes snapshots',
    () async {
      final operations = <String>[];
      const key = CacheKey(
        namespace: 'notes.list',
        userId: 'user-1',
        workspaceId: 'ws-1',
      );
      await store.prefetch<List<dynamic>>(
        key: key,
        policy: CachePolicies.moduleData,
        decode: (value) => value! as List<dynamic>,
        fetch: () async {
          operations.add('read');
          return ['server'];
        },
      );
      operations.clear();
      queue.registerDispatcher('notes', (_) async {
        operations.add('write');
      });
      await queue.enqueue(edit('edit-1'));
      await queue.synchronize();
      online = true;
      connectivity.add([ConnectivityResult.wifi]);
      await Future<void>.delayed(Duration.zero);
      await queue.synchronize();
      expect(operations.first, 'write');
      expect(operations.skip(1), everyElement('read'));
      expect(await queue.listPending(), isEmpty);
      expect(
        (await store.read<List<dynamic>>(
          key: key,
          decode: (value) => value! as List<dynamic>,
        )).data,
        ['server'],
      );
    },
  );

  test(
    'resume retries even when no connectivity event was delivered',
    () async {
      var sends = 0;
      queue.registerDispatcher('notes', (_) async {
        sends++;
      });
      await queue.enqueue(edit('edit-1'));
      await queue.synchronize();
      online = true;
      queue.didChangeAppLifecycleState(AppLifecycleState.resumed);
      await queue.synchronize();
      expect(sends, 1);
    },
  );

  test(
    '401 retains edits and token refresh resumes without manual retry',
    () async {
      var authorized = false;
      var sends = 0;
      queue.registerDispatcher('notes', (_) async {
        sends++;
        if (!authorized) {
          throw const ApiException(message: 'Expired session', statusCode: 401);
        }
      });
      await queue.enqueue(edit('edit-1', replaySafe: false));
      await queue.synchronize();
      online = true;
      await queue.synchronize();
      expect(
        (await queue.listPending()).single.status,
        PendingMutationStatus.queued,
      );
      authorized = true;
      auth.add(const supa.AuthState(supa.AuthChangeEvent.tokenRefreshed, null));
      await Future<void>.delayed(Duration.zero);
      await queue.synchronize();
      expect(sends, 2);
      expect(await queue.listPending(), isEmpty);
    },
  );

  test(
    'uncertain writes stay in review while independent scopes sync',
    () async {
      final sent = <String>[];
      queue
        ..registerDispatcher('notes', (record) async {
          sent.add(record.id);
          throw const ApiException(message: 'Connection lost', statusCode: 0);
        })
        ..registerDispatcher('calendar', (record) async {
          sent.add(record.id);
        });
      await queue.enqueue(edit('edit-1', replaySafe: false));
      await queue.enqueue(edit('edit-2', replaySafe: false));
      await queue.enqueue(edit('calendar-1', feature: 'calendar'));
      await queue.synchronize();
      online = true;
      await queue.synchronize();
      await queue.synchronize();
      expect(sent, ['edit-1', 'calendar-1']);
      expect((await queue.listPending()).map((row) => row.status), [
        PendingMutationStatus.conflict,
        PendingMutationStatus.queued,
      ]);
    },
  );

  test('account switch never replays another account edits', () async {
    final sent = <String>[];
    queue.registerDispatcher('notes', (record) async {
      sent.add(record.userId!);
    });
    await queue.enqueue(edit('edit-1'));
    await queue.synchronize();
    userId = 'user-2';
    await queue.enqueue(edit('edit-2', user: 'user-2'));
    await queue.synchronize();
    online = true;
    await queue.synchronize();
    expect(sent, ['user-2']);
    expect((await store.listPendingMutations()).single.userId, 'user-1');
    userId = 'user-1';
    await queue.synchronize();
    expect(sent, ['user-2', 'user-1']);
  });

  test('server cooldown blocks reconnect storms and manual retry', () async {
    var sends = 0;
    queue.registerDispatcher('notes', (_) async {
      sends++;
      throw const ApiException(
        message: 'Rate limited',
        statusCode: 429,
        retryAfter: 120,
      );
    });
    await queue.enqueue(edit('limited', replaySafe: false));
    await queue.synchronize();
    online = true;
    await queue.synchronize();
    expect(sends, 1);
    expect(
      (await queue.listPending()).single.status,
      PendingMutationStatus.queued,
    );
    await queue.synchronize();
    await queue.retry('limited');
    expect(sends, 1);
  });

  test('captcha pauses automatic replay without discarding the edit', () async {
    queue.registerDispatcher('notes', (_) async {
      throw const ApiException(
        message: 'Verify',
        statusCode: 403,
        isVerificationRequired: true,
      );
    });
    await queue.enqueue(edit('verification', replaySafe: false));
    await queue.synchronize();
    online = true;
    await queue.synchronize();
    expect(
      (await queue.listPending()).single.status,
      PendingMutationStatus.queued,
    );
  });

  test('permission failures do not auto retry', () async {
    var sends = 0;
    queue.registerDispatcher('notes', (_) async {
      sends++;
      throw const ApiException(message: 'Permission revoked', statusCode: 403);
    });
    await queue.enqueue(edit('edit-1'));
    await queue.synchronize();
    online = true;
    await queue.synchronize();
    await queue.synchronize();
    expect(sends, 1);
    expect(
      (await queue.listPending()).single.status,
      PendingMutationStatus.failed,
    );
  });
  test('account mismatch during replay keeps the owning edit queued', () async {
    final entered = Completer<void>();
    final resume = Completer<void>();
    queue.registerDispatcher('notes', (record) async {
      entered.complete();
      await resume.future;
      if (record.userId != userId) {
        throw const ApiException(
          message: 'Account changed during request',
          statusCode: 401,
        );
      }
    });
    await queue.enqueue(edit('account-switch'));
    await queue.synchronize();
    online = true;
    final drain = queue.drain();
    await entered.future;
    userId = 'user-2';
    resume.complete();
    await drain;
    userId = 'user-1';
    final records = await queue.listPending();
    expect(records.single.status, PendingMutationStatus.queued);
    expect(records.single.userId, 'user-1');
    expect(records.single.attemptCount, 1);
    online = false;
  });
}
