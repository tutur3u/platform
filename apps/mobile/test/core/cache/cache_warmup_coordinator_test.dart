import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mocktail/mocktail.dart';

class _Storage extends Mock implements FlutterSecureStorage {}

/// Registers the production 'tasks' group shape: five warm-up tasks issuing
/// six requests per full run (the portfolio fetch covers projects and
/// initiatives).
void _registerTasksGroup(
  CacheWarmupCoordinator coordinator,
  Future<void> Function() request,
) {
  coordinator
    ..register('tasks_list', ({forceRefresh = false}) => request())
    ..register('task_boards', ({forceRefresh = false}) => request())
    ..register('task_estimates', ({forceRefresh = false}) => request())
    ..register('task_labels', ({forceRefresh = false}) => request())
    ..register('task_portfolio', ({forceRefresh = false}) async {
      await request(); // projects
      await request(); // initiatives
    });
}

void main() {
  group('CacheWarmupCoordinator tasks module', () {
    late CacheWarmupCoordinator coordinator;
    late DateTime now;
    late String? scope;
    var requests = 0;

    Future<void> request() async {
      requests += 1;
    }

    setUp(() {
      now = DateTime(2026, 1, 1, 10);
      scope = 'user-a:ws-a';
      requests = 0;
      coordinator = CacheWarmupCoordinator.forTesting(clock: () => now)
        ..bindScope(() => scope);
      _registerTasksGroup(coordinator, request);
    });

    test(
      'three page opens inside the window issue one group of requests',
      () async {
        // Tasks -> Boards -> Estimates opened within the reuse window.
        await coordinator.prewarmModule('tasks');
        await coordinator.prewarmModule('tasks');
        await coordinator.prewarmModule('tasks');

        expect(requests, 6);
      },
    );

    test('window expiry warms the group again', () async {
      await coordinator.prewarmModule('tasks');
      now = now.add(
        CacheWarmupCoordinator.warmupReuseWindow + const Duration(seconds: 1),
      );
      await coordinator.prewarmModule('tasks');

      expect(requests, 12);
    });

    test('workspace or account switch inside the window warms again', () async {
      await coordinator.prewarmModule('tasks');
      scope = 'user-a:ws-b';
      await coordinator.prewarmModule('tasks');
      scope = 'user-b:ws-b';
      await coordinator.prewarmModule('tasks');

      expect(requests, 18);
    });

    test('failed run is not recorded and the next open warms again', () async {
      var fail = true;
      coordinator.register('task_labels', ({forceRefresh = false}) async {
        await request();
        if (fail) {
          throw StateError('label fetch failed');
        }
      });

      await coordinator.prewarmModule('tasks');
      fail = false;
      await coordinator.prewarmModule('tasks');

      expect(requests, 12);
    });

    test('force refresh bypasses the reuse window', () async {
      await coordinator.prewarmModule('tasks');
      await coordinator.prewarmModule('tasks', forceRefresh: true);

      expect(requests, 12);
    });

    test('unauthenticated scope runs without skipping or recording', () async {
      scope = null;
      await coordinator.prewarmModule('tasks');
      scope = 'user-a:ws-a';
      // The scope-less run recorded nothing, so this one cannot be skipped.
      await coordinator.prewarmModule('tasks');

      expect(requests, 12);
    });

    test('group with an unregistered task is not recorded as warmed', () async {
      final incomplete = CacheWarmupCoordinator.forTesting(clock: () => now)
        ..bindScope(() => 'user-a:ws-a')
        ..register('tasks_list', ({forceRefresh = false}) => request());

      await incomplete.prewarmModule('tasks');
      await incomplete.prewarmModule('tasks');

      expect(requests, 2);
    });

    test('signed-out run drops records so re-login warms again', () async {
      await coordinator.prewarmModule('tasks');
      scope = null; // Logged out; a module opens before sign-in completes.
      await coordinator.prewarmModule('tasks');
      scope = 'user-a:ws-a'; // Same account and workspace, inside the window.
      await coordinator.prewarmModule('tasks');

      expect(requests, 18);
    });

    test('reset forgets completed runs', () async {
      await coordinator.prewarmModule('tasks');
      coordinator.reset();
      await coordinator.prewarmModule('tasks');

      expect(requests, 12);
    });
  });

  group('CacheWarmupCoordinator with CacheStore clears', () {
    late Directory directory;
    late CacheStore store;
    late CacheWarmupCoordinator coordinator;
    String? user;
    var requests = 0;

    setUp(() async {
      directory = await Directory.systemTemp.createTemp('warmup-clear-');
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
      store = CacheStore.forTesting(
        secureStorage: storage,
        directoryResolver: () async => directory,
      );
      await store.init();
      user = 'user-a';
      requests = 0;
      final now = DateTime(2026, 1, 1, 10);
      // Same scope shape as the app binding: user, workspace, clear count.
      coordinator = CacheWarmupCoordinator.forTesting(clock: () => now)
        ..bindScope(
          () => user == null ? null : '$user:ws-a:${store.clearGeneration}',
        );
      _registerTasksGroup(coordinator, () async => requests++);
    });

    tearDown(() async {
      await store.closeForTesting();
      await Hive.close();
      await directory.delete(recursive: true);
    });

    test('logout clear then same-user re-login warms again', () async {
      await coordinator.prewarmModule('tasks');
      // Logout clears the account's resources; no module opens meanwhile.
      user = null;
      await store.clearResources(userId: 'user-a');
      user = 'user-a';
      await coordinator.prewarmModule('tasks');

      expect(requests, 12);
    });

    test('offline storage reset inside the window warms again', () async {
      await coordinator.prewarmModule('tasks');
      await coordinator.prewarmModule('tasks');
      expect(requests, 6);

      await store.clearResourceCache();
      await coordinator.prewarmModule('tasks');

      expect(requests, 12);
    });
  });
}
