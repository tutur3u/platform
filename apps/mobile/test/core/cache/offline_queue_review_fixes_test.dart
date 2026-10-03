import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/settings/view/offline_changes_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../helpers/helpers.dart';
import '../../helpers/offline_inventory_harness.dart';

class _Api extends Mock implements ApiClient {}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test(
    'retry preserves corrupt ciphertext and does not poison healthy replay',
    () async {
      final h = await OfflineInventoryHarness.create(_Api());
      addTearDown(h.dispose);
      final box = Hive.box<dynamic>('offline_mutations_v1');
      final corrupt = {
        'id': 'bad',
        'feature': 'inventory',
        'userId': 'actor',
        'workspaceId': 'ws',
        'createdAt': 'malformed',
      };
      await box.put('bad', corrupt);
      final sent = <String>[];
      h.queue.registerDispatcher(
        'tasks',
        (record) async => sent.add(record.id),
      );
      await h.store.savePendingMutation(
        PendingMutationRecord(
          id: 'healthy',
          feature: 'tasks',
          userId: 'actor',
          workspaceId: 'ws',
          method: 'PATCH',
          path: '/api/v1/tasks/synthetic',
          createdAt: DateTime.utc(2030),
          payload: const {'name': 'Synthetic'},
        ),
      );
      await h.queue.retry('bad');
      expect(box.get('bad'), corrupt);
      await h.queue.drain();
      expect(sent, ['healthy']);
      expect((await h.queue.listPending()).single.id, 'bad');
    },
  );

  test(
    'enqueue registers create provenance once, not on every pin pass',
    () async {
      final h = await OfflineInventoryHarness.create(_Api(), online: false);
      addTearDown(h.dispose);
      final writes = <BoxEvent>[];
      final subscription = Hive.box<dynamic>(
        'offline_entities_v1',
      ).watch().listen(writes.add);
      addTearDown(subscription.cancel);
      await h.queue.enqueue(
        PendingMutationRecord(
          id: 'create',
          feature: 'inventory',
          userId: 'actor',
          workspaceId: 'ws',
          method: 'POST',
          path: '/api/v1/workspaces/ws/product-categories',
          optimisticPatch: const {'entityId': 'local-category'},
          createdAt: DateTime.utc(2030),
          payload: const {'name': 'Synthetic'},
        ),
      );
      await h.queue.synchronize();
      expect(
        writes.where((e) => e.key.toString().startsWith('@local-origin:')),
        hasLength(1),
      );
    },
  );

  test(
    'acknowledged foreground save does not wait for cache refresh',
    () async {
      final h = await OfflineInventoryHarness.create(_Api());
      addTearDown(h.dispose);
      h.queue.registerDispatcher('inventory', (_) async {});
      await h.queue.synchronize();
      final cacheStarted = Completer<void>();
      final cacheRelease = Completer<Object?>();
      var fetches = 0;
      await h.store.prefetch<Object?>(
        key: const CacheKey(
          namespace: 'synthetic.catalog',
          userId: 'actor',
          workspaceId: 'ws',
        ),
        policy: CachePolicies.metadata,
        decode: (value) => value,
        fetch: () async {
          if (++fetches == 1) return <String, Object?>{};
          if (!cacheStarted.isCompleted) cacheStarted.complete();
          return await cacheRelease.future;
        },
      );
      final write = h.queue.performInventoryMutation(
        feature: 'inventory',
        method: 'PATCH',
        path: '/api/v1/workspaces/ws/products/product',
        workspaceId: 'ws',
        entityId: 'product',
        payload: const {'name': 'Synthetic'},
      );
      try {
        await cacheStarted.future;
        await expectLater(
          write.timeout(const Duration(milliseconds: 250)),
          completes,
        );
      } finally {
        cacheRelease.complete(<String, Object?>{});
        await write;
      }
    },
  );

  test(
    'receipt response mismatch is retained without automatic resend',
    () async {
      final h = await OfflineInventoryHarness.create(_Api());
      addTearDown(h.dispose);
      var attempts = 0;
      h.queue.registerDispatcher('inventory', (_) async {
        attempts++;
        throw const ApiException(
          message: 'Invalid offline create response',
          statusCode: 500,
          code: 'OFFLINE_CONTRACT_RESPONSE_MISMATCH',
        );
      });
      await expectLater(
        h.queue.performInventoryMutation(
          feature: 'inventory',
          method: 'POST',
          path: '/api/v1/workspaces/ws/product-categories',
          workspaceId: 'ws',
          entityId: 'local',
          payload: const {'name': 'Synthetic'},
        ),
        throwsA(isA<ApiException>()),
      );
      final retained = (await h.queue.listPending()).single;
      expect(retained.status, PendingMutationStatus.failed);
      await h.queue.drain();
      await h.queue.synchronize();
      expect(attempts, 1);
      expect((await h.queue.listPending()).single.id, retained.id);
    },
  );

  testWidgets('unreadable retained operation offers Discard without Retry', (
    tester,
  ) async {
    final queue = OfflineMutationQueue.instance;
    final previous = queue.pending.value;
    addTearDown(() => queue.pending.value = previous);
    queue.pending.value = [
      PendingMutationRecord(
        id: 'invalid',
        feature: 'inventory',
        method: 'INVALID',
        path: '',
        createdAt: DateTime.utc(2030),
        status: PendingMutationStatus.conflict,
        dependencyIssue: OfflineDependencyIssue.invalidPayload,
      ),
    ];
    await tester.pumpApp(
      Builder(
        builder: (context) => TextButton(
          onPressed: () => showOfflineChangesSheet(context),
          child: const Text('Open changes'),
        ),
      ),
    );
    await tester.tap(find.text('Open changes'));
    await tester.pumpAndSettle();
    expect(find.text('Discard local change'), findsOneWidget);
    expect(find.text('Retry'), findsNothing);
  });
}
