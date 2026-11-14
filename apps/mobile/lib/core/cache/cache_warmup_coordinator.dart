import 'dart:async';

import 'package:flutter/foundation.dart';

typedef CacheWarmupTask = Future<void> Function({bool forceRefresh});

typedef CacheWarmupClock = DateTime Function();

/// Identifies the account and workspace that warm-up results belong to.
typedef CacheWarmupScopeKey = String? Function();

class CacheWarmupCoordinator {
  CacheWarmupCoordinator._({CacheWarmupClock? clock})
    : _clock = clock ?? DateTime.now;

  @visibleForTesting
  CacheWarmupCoordinator.forTesting({CacheWarmupClock? clock})
    : this._(clock: clock);

  /// A group that ran fully for one scope is not repeated inside this
  /// window. Every tasks-module entry stays fresh for at least this long
  /// (CachePolicies.summary.staleAfter), and visible screens revalidate on
  /// entry, so an immediate repeat only duplicates network traffic.
  static const Duration warmupReuseWindow = Duration(minutes: 2);

  static final CacheWarmupCoordinator instance = CacheWarmupCoordinator._();

  final CacheWarmupClock _clock;
  CacheWarmupScopeKey? _scopeKey;

  /// Scope that every entry in [_recentRuns] belongs to. Only the current
  /// scope is remembered; observing any other scope drops every record.
  String? _recentScope;

  /// Completion time of each group that ran fully for [_recentScope].
  final Map<String, DateTime> _recentRuns = {};

  final Map<String, CacheWarmupTask> _tasks = {};
  final Map<String, List<String>> _groups = {
    'boot': <String>[
      'apps_registry',
      'assistant_metadata',
      'inventory_catalog',
    ],
    'home': <String>['apps_registry', 'assistant_metadata', 'home_payload'],
    'tasks': <String>[
      'tasks_list',
      'task_boards',
      'task_estimates',
      'task_labels',
      'task_portfolio',
    ],
    'finance': <String>['finance_overview', 'finance_transactions'],
    'inventory': <String>['inventory_catalog'],
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

  /// Binds the scope used to suppress repeat warm-ups. The resolver should
  /// change whenever cached data may have been dropped (account, workspace,
  /// cache clear). A null scope disables suppression and drops every record,
  /// so signed-out or workspace-less states never carry a record forward.
  void bindScope(CacheWarmupScopeKey resolver) {
    _scopeKey = resolver;
    reset();
  }

  /// Forgets every completed run so the next warm-up of each group runs.
  void reset() {
    _recentScope = null;
    _recentRuns.clear();
  }

  Future<void> prewarmBoot({bool forceRefresh = false}) {
    return _runGroup('boot', forceRefresh: forceRefresh);
  }

  Future<void> prewarmHome({bool forceRefresh = false}) {
    return _runGroup('home', forceRefresh: forceRefresh);
  }

  Future<void> prewarmModule(String moduleId, {bool forceRefresh = false}) {
    return _runGroup(moduleId, forceRefresh: forceRefresh);
  }

  Future<void> _runGroup(String groupId, {required bool forceRefresh}) async {
    final ids = _groups[groupId] ?? const <String>[];
    if (ids.isEmpty) return;

    final scope = _scopeKey?.call();
    if (scope != _recentScope) {
      reset();
      _recentScope = scope;
    }
    if (forceRefresh) {
      _recentRuns.remove(groupId);
    } else if (scope != null && _recentlyWarmed(groupId, scope)) {
      return;
    }

    var allRan = true;
    for (var index = 0; index < ids.length; index += 3) {
      final chunk = ids.skip(index).take(3);
      await Future.wait(
        chunk.map((id) async {
          final task = _tasks[id];
          if (task == null) {
            allRan = false;
            return;
          }
          try {
            await task(forceRefresh: forceRefresh);
          } on Object {
            allRan = false;
            // Prefetch is optional; visible screens own errors and retry.
          }
        }),
      );
    }
    // Record only if the scope held for the whole run; a scope change while
    // the run was in flight already reset the records for the new scope.
    if (!forceRefresh &&
        allRan &&
        scope != null &&
        _scopeKey?.call() == scope &&
        _recentScope == scope) {
      _recentRuns[groupId] = _clock();
    }
  }

  bool _recentlyWarmed(String groupId, String scope) {
    if (_recentScope != scope) return false;
    final completedAt = _recentRuns[groupId];
    if (completedAt == null) return false;
    return _clock().difference(completedAt) < warmupReuseWindow;
  }
}
