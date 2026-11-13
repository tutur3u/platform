import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';

void main() {
  group('CacheWarmupCoordinator tasks module', () {
    // Mirrors the production 'tasks' group: five registered warm-up tasks
    // issuing six network requests per full run, because the portfolio
    // fetch covers both projects and initiatives.
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
        ..bindScope(() => scope)
        ..register('tasks_list', ({forceRefresh = false}) => request())
        ..register('task_boards', ({forceRefresh = false}) => request())
        ..register('task_estimates', ({forceRefresh = false}) => request())
        ..register('task_labels', ({forceRefresh = false}) => request())
        ..register('task_portfolio', ({forceRefresh = false}) async {
          await request(); // projects
          await request(); // initiatives
        });
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
  });
}
