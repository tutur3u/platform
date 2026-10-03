import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/offline_preparation_coordinator.dart';

void main() {
  late OfflinePreparationCoordinator coordinator;
  late Map<String, Map<String, DateTime>> metadata;
  setUp(() {
    metadata = {};
    coordinator = OfflinePreparationCoordinator.forTesting(
      load: (user, workspace) async => metadata['$user:$workspace'] ?? {},
      write: (user, workspace, completed) async {
        metadata['$user:$workspace'] = {...completed};
      },
    );
  });

  test(
    'sequential products settle failures and retry only selected product',
    () async {
      final calls = <String>[];
      var failed = true;
      for (final id in OfflinePreparationCoordinator.productIds) {
        coordinator.register(id, (_) async {
          calls.add(id);
          if (id == 'finance' && failed) throw Exception('Offline');
          if (id == 'inventory') throw const OfflinePreparationUnavailable();
        });
      }
      await coordinator.run(userId: 'owner', workspaceId: 'team');
      expect(calls, OfflinePreparationCoordinator.productIds);
      expect(
        coordinator.state.value.products['finance']!.status,
        OfflinePreparationStatus.failed,
      );
      expect(
        coordinator.state.value.products['inventory']!.status,
        OfflinePreparationStatus.unavailable,
      );
      expect(
        coordinator.state.value.products['tasks']!.status,
        OfflinePreparationStatus.ready,
      );
      expect(coordinator.state.value.running, isFalse);
      expect(metadata['owner:team']!.keys, containsAll(['tasks', 'calendar']));
      failed = false;
      calls.clear();
      await coordinator.run(
        userId: 'owner',
        workspaceId: 'team',
        productId: 'finance',
      );
      expect(calls, ['finance']);
      expect(
        coordinator.state.value.products['finance']!.status,
        OfflinePreparationStatus.ready,
      );
    },
  );

  test(
    'restored timestamps are historical and cannot prove retained cache',
    () async {
      final date = DateTime.utc(2026, 10, 2);
      metadata['owner:team'] = {'finance': date};
      coordinator.register('finance', (_) async {});
      await coordinator.setScope(userId: 'owner', workspaceId: 'team');
      expect(coordinator.state.value.products['finance']!.lastSuccess, date);
      expect(
        coordinator.state.value.products['finance']!.status,
        OfflinePreparationStatus.queued,
      );
      await coordinator.setScope(userId: 'other', workspaceId: 'team');
      expect(coordinator.state.value.products['finance']!.lastSuccess, isNull);
    },
  );

  test(
    'scope switch cancels downstream tasks and old completion writes',
    () async {
      final first = Completer<void>();
      final started = Completer<void>();
      var taskCalls = 0;
      coordinator
        ..register('finance', (_) async {
          started.complete();
          await first.future;
        })
        ..register('tasks', (_) async => taskCalls++);
      final run = coordinator.run(userId: 'first', workspaceId: 'team');
      await started.future;
      await coordinator.setScope(userId: 'second', workspaceId: 'other');
      expect(coordinator.state.value.products['finance']!.lastSuccess, isNull);
      expect(
        coordinator.state.value.running,
        isTrue,
        reason: 'Old in-flight work must drain before admitting another run',
      );
      first.complete();
      await run;
      expect(coordinator.state.value.userId, 'second');
      expect(coordinator.state.value.workspaceId, 'other');
      expect(coordinator.state.value.running, isFalse);
      expect(taskCalls, 0);
      expect(metadata, isEmpty);
    },
  );

  test(
    'concurrent runs do not duplicate requests even after cancellation',
    () async {
      final pending = Completer<void>();
      final started = Completer<void>();
      var calls = 0;
      coordinator.register('finance', (_) async {
        calls++;
        started.complete();
        await pending.future;
      });
      final run = coordinator.run(userId: 'owner', workspaceId: 'team');
      await started.future;
      await coordinator.run(userId: 'owner', workspaceId: 'team');
      coordinator.cancel();
      await coordinator.run(userId: 'owner', workspaceId: 'team');
      expect(calls, 1);
      pending.complete();
      await run;
      expect(
        coordinator.state.value.products['finance']!.status,
        OfflinePreparationStatus.queued,
      );
      expect(metadata, isEmpty);
    },
  );

  test('late restoration cannot overwrite newly downloaded status', () async {
    final restore = Completer<Map<String, DateTime>>();
    coordinator = OfflinePreparationCoordinator.forTesting(
      load: (_, _) => restore.future,
      write: (_, _, _) async {},
    )..register('finance', (_) async {});
    final restoring = coordinator.setScope(
      userId: 'owner',
      workspaceId: 'team',
    );
    await coordinator.run(
      userId: 'owner',
      workspaceId: 'team',
      productId: 'finance',
    );
    final success = coordinator.state.value.products['finance']!.lastSuccess;
    restore.complete({'finance': DateTime.utc(2020)});
    await restoring;
    expect(coordinator.state.value.products['finance']!.lastSuccess, success);
    expect(
      coordinator.state.value.products['finance']!.status,
      OfflinePreparationStatus.ready,
    );
  });

  test(
    'storage write and retention failures never announce readiness',
    () async {
      coordinator = OfflinePreparationCoordinator.forTesting(
        load: (_, _) async => {},
        write: (_, _, _) async => throw Exception('No storage'),
      )..register('finance', (_) async {});
      await coordinator.run(userId: 'owner', workspaceId: 'team');
      expect(
        coordinator.state.value.products['finance']!.status,
        OfflinePreparationStatus.failed,
      );
      expect(coordinator.state.value.products['finance']!.lastSuccess, isNull);
      coordinator =
          OfflinePreparationCoordinator.forTesting(
              load: (_, _) async => {},
              write: (_, _, _) async {},
            )
            ..register('finance', (_) async {})
            ..verifyRetention = (_, _) async => throw Exception('Evicted');
      await coordinator.run(userId: 'owner', workspaceId: 'team');
      expect(
        coordinator.state.value.products['finance']!.status,
        OfflinePreparationStatus.failed,
      );
      expect(coordinator.state.value.running, isFalse);
    },
  );
  test(
    'cache invalidation removes readiness while retaining download history',
    () async {
      coordinator.register('finance', (_) async {});
      await coordinator.run(
        userId: 'owner',
        workspaceId: 'team',
        productId: 'finance',
      );
      final timestamp =
          coordinator.state.value.products['finance']!.lastSuccess;
      coordinator.invalidateRetainedData();
      expect(
        coordinator.state.value.products['finance']!.status,
        OfflinePreparationStatus.queued,
      );
      expect(
        coordinator.state.value.products['finance']!.lastSuccess,
        timestamp,
      );
      expect(coordinator.state.value.running, isFalse);
    },
  );
}
