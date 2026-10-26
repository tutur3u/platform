import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const actor = 'owner';
  const workspace = 'workspace';
  const path = '/api/v1/workspaces/workspace/mail/mailboxes/mailbox/settings';
  late Directory directory;
  late _Storage storage;
  late CacheStore store;
  late OfflineMutationQueue queue;
  late _Api api;
  late bool online;

  CacheStore openStore() => CacheStore.forTesting(
    secureStorage: storage,
    directoryResolver: () async => directory,
  );

  OfflineMutationQueue openQueue() => OfflineMutationQueue.forTesting(
    store: store,
    userId: () => actor,
    checkConnectivity: () async => [
      if (online) ConnectivityResult.wifi else ConnectivityResult.none,
    ],
    connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
    apiFactory: (_) => api,
  );

  PendingMutationRecord edit(String feature) => PendingMutationRecord(
    id: 'original-operation',
    feature: feature,
    method: 'PATCH',
    path: path,
    userId: actor,
    workspaceId: workspace,
    payload: const {'senderName': 'Offline edit'},
    createdAt: DateTime.utc(2026),
  );

  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mail-dispatch-');
    storage = _Storage();
    final secrets = <String, String?>{};
    when(() => storage.read(key: any(named: 'key'))).thenAnswer(
      (invocation) async => secrets[invocation.namedArguments[#key]],
    );
    when(
      () => storage.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    ).thenAnswer((invocation) async {
      secrets[invocation.namedArguments[#key] as String] =
          invocation.namedArguments[#value] as String?;
    });
    online = false;
    api = _Api();
    store = openStore();
    queue = openQueue();
  });

  tearDown(() async {
    await queue.synchronize();
    await queue.dispose();
    await store.closeForTesting();
    await directory.delete(recursive: true);
  });

  for (final feature in ['mail', 'mail_settings']) {
    test(
      '$feature restart never repeats an interrupted settings PATCH',
      () async {
        final original = edit(feature);
        await queue.enqueue(original);
        await queue.synchronize();
        var calls = 0;
        var serverName = 'Before';
        String? persistedAtAcceptance;
        when(() => api.patchJson(path, any())).thenAnswer((invocation) async {
          calls++;
          serverName =
              (invocation.positionalArguments[1] as Map)['senderName']
                  as String;
          if (calls == 1) {
            persistedAtAcceptance = jsonEncode(
              (await store.listPendingMutations()).single.toJson(),
            );
            // A fatal stop bypasses Exception classification. Capture durable
            // bytes before unwinding, without an ACK or transport-error catch.
            throw StateError('Simulated process termination after acceptance');
          }
          return {
            'settings': {'senderName': serverName},
          };
        });
        online = true;
        await expectLater(queue.drain(), throwsStateError);
        expect(calls, 1);
        expect(serverName, 'Offline edit');
        await queue.dispose();
        expect(
          jsonEncode((await store.listPendingMutations()).single.toJson()),
          persistedAtAcceptance,
        );
        await store.closeForTesting();

        serverName = 'Later web edit';
        store = openStore();
        queue = openQueue();
        await queue.synchronize();
        await queue.drain();
        await queue.synchronize(onResume: true);
        expect(calls, 1);
        expect(serverName, 'Later web edit');
        final retained = (await queue.listPending()).single;
        expect(retained.id, original.id);
        expect(retained.feature, original.feature);
        expect(retained.payload, original.payload);
        expect(retained.status, PendingMutationStatus.conflict);
        expect(queue.pending.value.single.id, original.id);
      },
    );
  }

  test('Retry cannot erase an in-flight settings review fence', () async {
    final original = edit('mail_settings');
    await queue.enqueue(original);
    await queue.synchronize();
    final entered = Completer<void>();
    final response = Completer<Map<String, dynamic>>();
    when(() => api.patchJson(path, any())).thenAnswer((_) {
      entered.complete();
      return response.future;
    });
    online = true;
    final sending = queue.drain();
    Future<void>? retrying;
    try {
      await entered.future;
      await queue.refresh();
      expect(queue.pending.value.single.status, PendingMutationStatus.conflict);
      retrying = queue.retry(original.id);
      await Future<void>.delayed(Duration.zero);
      final retained = (await store.listPendingMutations()).single;
      expect(retained.id, original.id);
      expect(retained.payload, original.payload);
      expect(retained.status, PendingMutationStatus.conflict);
    } finally {
      response.complete({
        'settings': {'senderName': 'Offline edit'},
      });
      await sending;
      await retrying;
    }
    expect(await queue.listPending(), isEmpty);
    verify(() => api.patchJson(path, original.payload!)).called(1);
  });

  test('a conclusive rejection can retry the original settings edit', () async {
    final original = edit('mail_settings');
    await queue.enqueue(original);
    await queue.synchronize();
    var calls = 0;
    when(() => api.patchJson(path, any())).thenAnswer((_) async {
      calls++;
      if (calls == 1) {
        throw const ApiException(message: 'Sign in', statusCode: 401);
      }
      return {
        'settings': {'senderName': 'Offline edit'},
      };
    });
    online = true;
    await queue.drain();
    final rejected = (await queue.listPending()).single;
    expect(rejected.id, original.id);
    expect(rejected.payload, original.payload);
    expect(rejected.status, PendingMutationStatus.queued);
    await queue.drain();
    expect(calls, 2);
    expect(await queue.listPending(), isEmpty);
  });
}
