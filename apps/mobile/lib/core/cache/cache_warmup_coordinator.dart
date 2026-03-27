import 'dart:async';

typedef CacheWarmupTask = Future<void> Function({bool forceRefresh});

class CacheWarmupCoordinator {
  CacheWarmupCoordinator._();

  static final CacheWarmupCoordinator instance = CacheWarmupCoordinator._();

  final Map<String, CacheWarmupTask> _tasks = {};
  final Map<String, List<String>> _groups = {
    'boot': <String>['home_payload', 'assistant_metadata', 'apps_registry'],
    'home': <String>['assistant_metadata', 'apps_registry'],
    'tasks': <String>[
      'tasks_list',
      'task_boards',
      'task_estimates',
      'task_labels',
      'task_portfolio',
    ],
    'finance': <String>['finance_overview', 'finance_transactions'],
    'habits': <String>['habits_overview', 'habits_activity'],
    'timer': <String>['time_tracker_root', 'time_tracker_requests'],
    'apps': <String>[
      'tasks_list',
      'calendar_root',
      'finance_overview',
      'habits_overview',
      'time_tracker_root',
    ],
  };

  void register(String id, CacheWarmupTask task) {
    _tasks[id] = task;
  }

  Future<void> prewarmBoot({bool forceRefresh = false}) {
    return _runGroup('boot', forceRefresh: forceRefresh);
  }

  Future<void> prewarmHome({bool forceRefresh = false}) {
    return _runGroup('home', forceRefresh: forceRefresh);
  }

  Future<void> prewarmModule(
    String moduleId, {
    bool forceRefresh = false,
  }) {
    return _runGroup(moduleId, forceRefresh: forceRefresh);
  }

  Future<void> _runGroup(
    String groupId, {
    required bool forceRefresh,
  }) async {
    final ids = _groups[groupId] ?? const <String>[];
    if (ids.isEmpty) return;

    for (var index = 0; index < ids.length; index += 3) {
      final chunk = ids.skip(index).take(3);
      await Future.wait(
        chunk.map((id) async {
          final task = _tasks[id];
          if (task == null) return;
          await task(forceRefresh: forceRefresh);
        }),
      );
    }
  }
}
