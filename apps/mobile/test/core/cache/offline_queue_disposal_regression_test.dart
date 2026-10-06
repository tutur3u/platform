import 'dart:async';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  for (final aba in [false, true]) {
    test('disposed queue cannot refresh new resources actorABA=$aba', () async {
      final directory = await Directory.systemTemp.createTemp(
        'queue-disposal-',
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
      final entered = Completer<void>();
      final release = Completer<List<ConnectivityResult>>();
      String? actor = 'synthetic-owner';
      final queue = OfflineMutationQueue.forTesting(
        store: store,
        userId: () => actor,
        checkConnectivity: () {
          if (!entered.isCompleted) entered.complete();
          return release.future;
        },
        connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
        authChanges: const Stream<AuthState>.empty(),
      );
      Future<void>? synchronization;
      try {
        await queue.init();
        synchronization = queue.synchronize();
        await entered.future;
        await queue.dispose();
        if (aba) {
          actor = null;
          actor = 'synthetic-other';
          actor = 'synthetic-owner';
        }
        await store.clearScope();
        var refreshes = 0;
        await store.prefetch<List<String>>(
          key: const CacheKey(
            namespace: 'finance.wallets',
            userId: 'synthetic-owner',
            workspaceId: 'synthetic-workspace',
          ),
          policy: CachePolicies.moduleData,
          decode: (value) => List<String>.from(value! as List),
          fetch: () async {
            refreshes++;
            return ['newly-admitted'];
          },
        );
        refreshes = 0;
        release.complete([ConnectivityResult.wifi]);
        await synchronization;
        expect(refreshes, 0);
        final nextQueue = OfflineMutationQueue.forTesting(
          store: store,
          userId: () => actor,
          checkConnectivity: () async => [ConnectivityResult.wifi],
          connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
          authChanges: const Stream<AuthState>.empty(),
        );
        try {
          await nextQueue.synchronize();
          expect(refreshes, greaterThan(0));
        } finally {
          await nextQueue.dispose();
        }
      } finally {
        if (!release.isCompleted) release.complete([ConnectivityResult.none]);
        await synchronization;
        await queue.dispose();
        await store.closeForTesting();
        await directory.delete(recursive: true);
      }
    });
  }

  test('disposal before initialization permanently closes admission', () async {
    final storage = _Storage();
    final store = CacheStore.forTesting(
      secureStorage: storage,
      directoryResolver: () async => throw StateError('Must not initialize'),
    );
    final queue = OfflineMutationQueue.forTesting(
      store: store,
      userId: () => 'synthetic-owner',
      checkConnectivity: () async => throw StateError('Must not connect'),
      connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
      authChanges: const Stream<AuthState>.empty(),
    );
    await queue.dispose();
    await expectLater(queue.init(), throwsStateError);
    await queue.synchronize();
    await queue.drain();
    verifyNever(() => storage.read(key: any(named: 'key')));
  });

  test(
    'disposal during initialization cannot resurrect subscriptions',
    () async {
      final directory = await Directory.systemTemp.createTemp('queue-init-');
      final entered = Completer<void>();
      final release = Completer<Directory>();
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
        directoryResolver: () {
          entered.complete();
          return release.future;
        },
      );
      var subscriptions = 0;
      final connectivity = StreamController<List<ConnectivityResult>>.broadcast(
        onListen: () => subscriptions++,
      );
      final queue = OfflineMutationQueue.forTesting(
        store: store,
        userId: () => 'synthetic-owner',
        checkConnectivity: () async => [ConnectivityResult.wifi],
        connectivityChanges: connectivity.stream,
        authChanges: const Stream<AuthState>.empty(),
      );
      final initialization = queue.init();
      try {
        await entered.future;
        await queue.dispose();
        release.complete(directory);
        await initialization;
        expect(subscriptions, 0);
        await expectLater(queue.init(), throwsStateError);
      } finally {
        if (!release.isCompleted) release.complete(directory);
        await initialization;
        await queue.dispose();
        await connectivity.close();
        await store.closeForTesting();
        await directory.delete(recursive: true);
      }
    },
  );

  for (final inventory in [false, true]) {
    test(
      'already dispatched ACK survives disposal inventory=$inventory',
      () async {
        final directory = await Directory.systemTemp.createTemp('queue-ack-');
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
        final entered = Completer<void>();
        final release = Completer<void>();
        final queue = OfflineMutationQueue.forTesting(
          store: store,
          userId: () => 'synthetic-owner',
          checkConnectivity: () async => [ConnectivityResult.wifi],
          connectivityChanges: const Stream<List<ConnectivityResult>>.empty(),
          authChanges: const Stream<AuthState>.empty(),
        );
        var dispatched = 0;
        Future<void>? synchronization;
        try {
          final record = PendingMutationRecord(
            id: 'synthetic-operation',
            feature: inventory ? 'finance' : 'synthetic',
            userId: 'synthetic-owner',
            workspaceId: 'synthetic-workspace',
            method: 'PUT',
            path: inventory
                ? '/api/workspaces/synthetic-workspace/wallets/synthetic-wallet'
                : '/synthetic',
            payload: const {'name': 'Synthetic'},
            createdAt: DateTime(2026),
          );
          await store.savePendingMutation(record);
          queue.registerDispatcher(record.feature, (admitted) async {
            dispatched++;
            if (!entered.isCompleted) entered.complete();
            await release.future;
            if (inventory) {
              await store.updatePendingMutation(
                admitted.id,
                (current) => current.copyWith(acknowledgedWrite: true),
              );
            }
          });
          synchronization = queue.synchronize();
          await entered.future;
          await queue.dispose();
          release.complete();
          await synchronization;
          expect(dispatched, 1);
          expect(await store.listPendingMutations(), isEmpty);
          await queue.synchronize();
          expect(dispatched, 1);
        } finally {
          if (!release.isCompleted) release.complete();
          await synchronization;
          await queue.dispose();
          await store.closeForTesting();
          await directory.delete(recursive: true);
        }
      },
    );
  }
}
