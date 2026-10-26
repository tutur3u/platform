import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_preparation_intent.dart';
import 'package:mobile/data/sources/api_client.dart';

typedef OfflinePreparationTask = Future<void> Function(String workspaceId);
typedef OfflinePreparationLoader =
    Future<Map<String, DateTime>> Function(String userId, String workspaceId);
typedef OfflinePreparationWriter =
    Future<void> Function(
      String userId,
      String workspaceId,
      Map<String, DateTime> completed,
    );

enum OfflinePreparationStatus {
  queued,
  downloading,
  ready,
  failed,
  unavailable,
}

class OfflinePreparationUnavailable implements Exception {
  const OfflinePreparationUnavailable();
}

@immutable
class OfflineProductPreparation {
  const OfflineProductPreparation({
    this.status = OfflinePreparationStatus.queued,
    this.lastSuccess,
    this.errorMessage,
  });

  final OfflinePreparationStatus status;
  final DateTime? lastSuccess;
  final String? errorMessage;
}

@immutable
class OfflinePreparationState {
  const OfflinePreparationState({
    this.userId,
    this.workspaceId,
    this.running = false,
    this.products = const {},
    this.retryAt,
    this.retryExhausted = false,
  });

  final String? userId;
  final String? workspaceId;
  final bool running;
  final DateTime? retryAt;
  final bool retryExhausted;
  final Map<String, OfflineProductPreparation> products;
  int get completed => products.values
      .where((product) => product.status == OfflinePreparationStatus.ready)
      .length;
}

/// Explicit scoped snapshot downloads.
///
/// Screen revalidation remains independent. Generations cancel stale progress.
class OfflinePreparationCoordinator {
  OfflinePreparationCoordinator._()
    : _load = _loadMetadata,
      _write = _writeMetadata,
      _intents = CachedOfflinePreparationIntentStore(),
      _network = Connectivity().checkConnectivity,
      _networkEvents = Connectivity().onConnectivityChanged,
      _clock = DateTime.now;

  @visibleForTesting
  OfflinePreparationCoordinator.forTesting({
    required OfflinePreparationLoader load,
    required OfflinePreparationWriter write,
    OfflinePreparationIntentStore? intents,
    Future<List<ConnectivityResult>> Function()? network,
    Stream<List<ConnectivityResult>>? networkEvents,
    DateTime Function()? clock,
  }) : _load = load,
       _write = write,
       _intents = intents,
       _network = network ?? (() async => [ConnectivityResult.wifi]),
       _networkEvents = networkEvents,
       _clock = clock ?? DateTime.now;

  static final OfflinePreparationCoordinator instance =
      OfflinePreparationCoordinator._();
  static const productIds = ['finance', 'inventory', 'tasks', 'calendar'];
  final ValueNotifier<OfflinePreparationState> state = ValueNotifier(
    const OfflinePreparationState(),
  );
  final _tasks = <String, OfflinePreparationTask>{};
  final OfflinePreparationLoader _load;
  final OfflinePreparationWriter _write;
  final OfflinePreparationIntentStore? _intents;
  final Future<List<ConnectivityResult>> Function() _network;
  final Stream<List<ConnectivityResult>>? _networkEvents;
  final DateTime Function() _clock;
  Timer? _retryTimer;
  StreamSubscription<List<ConnectivityResult>>? _reconnectSubscription;
  DateTime? _retryAt;
  int _retryAttempts = 0;
  Set<String> _pendingProducts = {};
  bool _wifiOnly = true;
  Future<void> _intentWrites = Future<void>.value();
  int _generation = 0;
  bool _busy = false;
  Future<void>? _resuming;
  int? _resumeGeneration;
  int? _activeGeneration;
  final Set<String> _removedDuringRun = {};

  int get scopeRevision => _generation;

  bool canContinue(String userId, String workspaceId) =>
      _busy &&
      _activeGeneration == _generation &&
      state.value.userId == userId &&
      state.value.workspaceId == workspaceId;
  Future<void> Function(String userId, String workspaceId)? verifyRetention;
  Future<void> Function(String userId, String workspaceId, String product)?
  verifyProductRetention;

  void register(String productId, OfflinePreparationTask task) {
    _tasks[productId] = task;
  }

  void unregister(String productId) => _tasks.remove(productId);

  bool _current(int generation, String userId, String workspaceId) =>
      generation == _generation &&
      state.value.userId == userId &&
      state.value.workspaceId == workspaceId;

  Future<void> setScope({String? userId, String? workspaceId}) async {
    if (state.value.userId == userId &&
        state.value.workspaceId == workspaceId) {
      return;
    }
    final generation = ++_generation;
    _retryTimer?.cancel();
    unawaited(_reconnectSubscription?.cancel());
    _reconnectSubscription = null;
    _retryAt = null;
    _retryAttempts = 0;
    _removedDuringRun.clear();
    state.value = OfflinePreparationState(
      userId: userId,
      workspaceId: workspaceId,
      running: _busy,
      products: {
        for (final id in productIds)
          id: OfflineProductPreparation(
            status: _tasks.containsKey(id)
                ? OfflinePreparationStatus.queued
                : OfflinePreparationStatus.unavailable,
          ),
      },
    );
    if (userId == null || workspaceId == null) return;
    _reconnectSubscription = _networkEvents?.listen((interfaces) {
      if (state.value.userId == userId &&
          state.value.workspaceId == workspaceId &&
          interfaces.any((value) => value != ConnectivityResult.none)) {
        unawaited(
          resumePending(
            userId: userId,
            workspaceId: workspaceId,
          ).catchError((Object _) {}),
        );
      }
    });
    try {
      final completed = await _load(userId, workspaceId);
      if (!_current(generation, userId, workspaceId)) {
        return;
      }
      state.value = OfflinePreparationState(
        userId: userId,
        workspaceId: workspaceId,
        running: _busy,
        retryAt: _retryAt,
        retryExhausted: _retryAttempts >= 3,
        products: {
          for (final id in productIds)
            id: OfflineProductPreparation(
              status: !_tasks.containsKey(id)
                  ? OfflinePreparationStatus.unavailable
                  : OfflinePreparationStatus.queued,
              lastSuccess: completed[id],
            ),
        },
      );
    } on Object {
      // Missing/unreadable metadata never claims a completed download.
    }
  }

  Future<void> run({
    required String userId,
    required String workspaceId,
    String? productId,
    bool resume = false,
    bool wifiOnly = true,
    Set<String>? requestedProducts,
    int? expectedScopeGeneration,
    bool automatic = false,
  }) async {
    if (expectedScopeGeneration != null &&
        !_current(expectedScopeGeneration, userId, workspaceId)) {
      return;
    }
    await setScope(userId: userId, workspaceId: workspaceId);
    if ((expectedScopeGeneration != null &&
            !_current(expectedScopeGeneration, userId, workspaceId)) ||
        _busy ||
        state.value.userId != userId ||
        state.value.workspaceId != workspaceId) {
      return;
    }
    final generation = ++_generation;
    _busy = true;
    _activeGeneration = generation;
    _removedDuringRun.clear();
    final ids = requestedProducts != null
        ? productIds.where(requestedProducts.contains).toList()
        : productId != null
        ? [productId]
        : resume
        ? productIds
              .where(
                (id) =>
                    state.value.products[id]?.status !=
                    OfflinePreparationStatus.ready,
              )
              .toList()
        : productIds;
    final networkSubscription = _networkEvents?.listen((interfaces) {
      if (_wifiOnly &&
          !interfaces.contains(ConnectivityResult.wifi) &&
          _current(generation, userId, workspaceId)) {
        _stop(clearIntent: false);
      }
    });
    _wifiOnly = wifiOnly;
    _pendingProducts = ids.where(_tasks.containsKey).toSet();
    final products = {...state.value.products};
    void publish({required bool running}) {
      // Retention reads yield; a verified earlier product can be evicted while
      // a later product is checked. Never overwrite those removal events.
      for (final id in _removedDuringRun) {
        final product = products[id];
        if (product?.status == OfflinePreparationStatus.ready) {
          products[id] = OfflineProductPreparation(
            status: _tasks.containsKey(id)
                ? OfflinePreparationStatus.queued
                : OfflinePreparationStatus.unavailable,
            lastSuccess: product!.lastSuccess,
          );
        }
      }
      state.value = OfflinePreparationState(
        userId: userId,
        workspaceId: workspaceId,
        running: running,
        retryAt: _retryAt,
        retryExhausted: _retryAttempts >= 3,
        products: Map.unmodifiable(products),
      );
    }

    try {
      final retained = await _intents?.load(userId, workspaceId);
      if (!_current(generation, userId, workspaceId)) return;
      if (retained != null) {
        _retryAt = retained.retryAt;
        _retryAttempts = retained.retryAttempts;
      }
      if (automatic &&
          ((_retryAt != null && _clock().isBefore(_retryAt!)) ||
              _retryAttempts >= 3)) {
        publish(running: false);
        return;
      }
      if (!automatic) _retryAttempts = 0;
      _retryAt = null;
      _retryTimer?.cancel();
      for (final id in ids) {
        products[id] = OfflineProductPreparation(
          status: _tasks.containsKey(id)
              ? OfflinePreparationStatus.queued
              : OfflinePreparationStatus.unavailable,
          lastSuccess: products[id]?.lastSuccess,
        );
      }
      publish(running: true);
      if (_intents != null) await _saveIntent(userId, workspaceId);
      if (!_current(generation, userId, workspaceId)) return;
      for (final id in ids) {
        if (!_current(generation, userId, workspaceId)) return;
        final task = _tasks[id];
        if (task == null) continue;
        if (_wifiOnly) {
          final interfaces = await _network();
          if (!_current(generation, userId, workspaceId) ||
              !interfaces.contains(ConnectivityResult.wifi)) {
            return;
          }
        }
        final lastSuccess = products[id]?.lastSuccess;
        products[id] = OfflineProductPreparation(
          status: OfflinePreparationStatus.downloading,
          lastSuccess: lastSuccess,
        );
        publish(running: true);
        try {
          await task(workspaceId);
          if (!_current(generation, userId, workspaceId)) return;
          final timestamp = DateTime.now().toUtc();
          // Persist before announcing readiness so disk failures stay visible.
          await _write(userId, workspaceId, {
            for (final entry in products.entries)
              if (entry.value.lastSuccess != null)
                entry.key: entry.value.lastSuccess!,
            id: timestamp,
          });
          if (!_current(generation, userId, workspaceId)) return;
          // Its successful download supersedes prior/own reconciliation.
          // Final retention checks still detect eviction or later removals.
          _removedDuringRun.remove(id);
          _pendingProducts.remove(id);
          if (_intents != null) await _saveIntent(userId, workspaceId);
          if (!_current(generation, userId, workspaceId)) return;
          products[id] = OfflineProductPreparation(
            status: OfflinePreparationStatus.ready,
            lastSuccess: timestamp,
          );
        } on Object catch (error) {
          if (!_current(generation, userId, workspaceId)) return;
          if (error is OfflinePreparationUnavailable ||
              (error is ApiException &&
                  (error.statusCode == 401 ||
                      error.statusCode == 403 &&
                          !error.isVerificationRequired))) {
            _pendingProducts.remove(id);
            if (_intents != null) await _saveIntent(userId, workspaceId);
            if (!_current(generation, userId, workspaceId)) return;
          }
          if (error is ApiException &&
              (error.statusCode == 503 || error.statusCode == 429)) {
            _retryAttempts++;
            final seconds = error.retryAfter ?? 30;
            _retryAt = _clock().toUtc().add(
              Duration(seconds: seconds.clamp(30, 15 * 60)),
            );
            products[id] = OfflineProductPreparation(lastSuccess: lastSuccess);
            if (_intents != null) await _saveIntent(userId, workspaceId);
            if (!_current(generation, userId, workspaceId)) return;
            break;
          }
          products[id] = OfflineProductPreparation(
            status:
                error is OfflinePreparationUnavailable ||
                    (error is ApiException &&
                        (error.statusCode == 401 ||
                            (error.statusCode == 403 &&
                                !error.isVerificationRequired)))
                ? OfflinePreparationStatus.unavailable
                : OfflinePreparationStatus.failed,
            lastSuccess: lastSuccess,
            errorMessage: error is OfflinePreparationUnavailable
                ? null
                : error is ApiException
                ? '${error.statusCode}: ${error.message}'
                : error.toString(),
          );
        }
        publish(running: true);
      }
      if (_current(generation, userId, workspaceId) &&
          verifyProductRetention != null) {
        for (final id in productIds) {
          if (!_current(generation, userId, workspaceId)) return;
          final product = products[id];
          if (product?.status != OfflinePreparationStatus.ready) continue;
          try {
            await verifyProductRetention!(userId, workspaceId, id);
          } on Object {
            products[id] = OfflineProductPreparation(
              status: OfflinePreparationStatus.failed,
              lastSuccess: product!.lastSuccess,
            );
          }
        }
      } else if (_current(generation, userId, workspaceId) &&
          verifyRetention != null) {
        try {
          await verifyRetention!(userId, workspaceId);
        } on Object {
          if (_current(generation, userId, workspaceId)) {
            for (final id in productIds) {
              final product = products[id];
              if (product?.status == OfflinePreparationStatus.ready) {
                products[id] = OfflineProductPreparation(
                  status: OfflinePreparationStatus.failed,
                  lastSuccess: product!.lastSuccess,
                );
              }
            }
          }
        }
      }
      if (_current(generation, userId, workspaceId)) publish(running: false);
    } finally {
      if (networkSubscription != null) await networkSubscription.cancel();
      _busy = false;
      _activeGeneration = null;
      final latest = state.value;
      state.value = OfflinePreparationState(
        userId: latest.userId,
        workspaceId: latest.workspaceId,
        products: latest.products,
        retryAt: _retryAt,
        retryExhausted: _retryAttempts >= 3,
      );
      if (_current(generation, userId, workspaceId)) {
        _scheduleRetry(userId, workspaceId);
      }
    }
  }

  void cancel() => _stop(clearIntent: true);

  void _stop({required bool clearIntent}) {
    _generation++;
    _retryTimer?.cancel();
    if (clearIntent) {
      _retryAt = null;
      _retryAttempts = 0;
    }
    if (clearIntent) _pendingProducts = {};
    final user = state.value.userId;
    final workspace = state.value.workspaceId;
    if (clearIntent && user != null && workspace != null) {
      // Capture the empty plan before another run starts.
      unawaited(_saveIntent(user, workspace).catchError((Object _) {}));
    }
    final latest = state.value;
    state.value = OfflinePreparationState(
      userId: latest.userId,
      workspaceId: latest.workspaceId,
      running: _busy,
      retryAt: _retryAt,
      retryExhausted: _retryAttempts >= 3,
      products: {
        for (final entry in latest.products.entries)
          entry.key: entry.value.status == OfflinePreparationStatus.downloading
              ? OfflineProductPreparation(lastSuccess: entry.value.lastSuccess)
              : entry.value,
      },
    );
  }

  Future<void> _saveIntent(String user, String workspace) {
    final intent = OfflinePreparationIntent(
      products: Set.of(_pendingProducts),
      wifiOnly: _wifiOnly,
      retryAt: _retryAt,
      retryAttempts: _retryAttempts,
    );
    final generation = _generation;
    final write = _intentWrites.then((_) async {
      if (!_current(generation, user, workspace)) return;
      await _intents?.save(user, workspace, intent);
    });
    _intentWrites = write.catchError((Object _) {});
    return write;
  }

  Future<void> resumePending({
    required String userId,
    required String workspaceId,
  }) {
    if (_resumeGeneration == _generation && _resuming != null) {
      return _resuming!;
    }
    final generation = _generation;
    _resumeGeneration = generation;
    final work = _resumePending(userId: userId, workspaceId: workspaceId);
    _resuming = work;
    return work.whenComplete(() {
      if (identical(_resuming, work)) _resuming = null;
    });
  }

  Future<void> _resumePending({
    required String userId,
    required String workspaceId,
  }) async {
    if (_busy ||
        state.value.userId != userId ||
        state.value.workspaceId != workspaceId) {
      return;
    }
    final generation = _generation;
    final intent = await _intents?.load(userId, workspaceId);
    if (!_current(generation, userId, workspaceId) || intent == null) return;
    _retryAt = intent.retryAt;
    _retryAttempts = intent.retryAttempts;
    final latest = state.value;
    state.value = OfflinePreparationState(
      userId: latest.userId,
      workspaceId: latest.workspaceId,
      products: latest.products,
      retryAt: _retryAt,
      retryExhausted: _retryAttempts >= 3,
    );
    if (_retryAttempts >= 3) return;
    if (_retryAt != null && _clock().isBefore(_retryAt!)) {
      _scheduleRetry(userId, workspaceId);
      return;
    }
    final interfaces = await _network();
    if (!_current(generation, userId, workspaceId) ||
        interfaces.isEmpty ||
        interfaces.every((value) => value == ConnectivityResult.none) ||
        intent.wifiOnly && !interfaces.contains(ConnectivityResult.wifi)) {
      return;
    }
    final pending = intent.products.where(_tasks.containsKey).toSet();
    if (pending.isEmpty) return;
    // Only original requested modules resume; no automatic scope expansion.
    await ApiClient.offlinePreparation(
      () => run(
        userId: userId,
        workspaceId: workspaceId,
        requestedProducts: pending,
        expectedScopeGeneration: generation,
        wifiOnly: intent.wifiOnly,
        automatic: true,
      ),
      allowChallenge: false,
      shouldContinue: () => canContinue(userId, workspaceId),
    );
  }

  void _scheduleRetry(String userId, String workspaceId) {
    _retryTimer?.cancel();
    if (_intents == null || _retryAt == null || _retryAttempts >= 3) return;
    final generation = _generation;
    final delay = _retryAt!.difference(_clock());
    _retryTimer = Timer(delay.isNegative ? Duration.zero : delay, () {
      if (!_current(generation, userId, workspaceId)) return;
      unawaited(
        resumePending(
          userId: userId,
          workspaceId: workspaceId,
        ).catchError((Object _) {}),
      );
    });
  }

  /// Cache clear or budget reduction removes any claim of current readiness.
  void invalidateRetainedData({Set<String>? productIds}) {
    if (productIds?.isEmpty ?? false) return;
    if (state.value.running) {
      _removedDuringRun.addAll(
        productIds ?? OfflinePreparationCoordinator.productIds,
      );
    }
    final latest = state.value;
    state.value = OfflinePreparationState(
      userId: latest.userId,
      workspaceId: latest.workspaceId,
      running: _busy,
      retryAt: _retryAt,
      retryExhausted: _retryAttempts >= 3,
      products: {
        for (final entry in latest.products.entries)
          entry.key: productIds != null && !productIds.contains(entry.key)
              ? entry.value
              : OfflineProductPreparation(
                  status: _tasks.containsKey(entry.key)
                      ? OfflinePreparationStatus.queued
                      : OfflinePreparationStatus.unavailable,
                  lastSuccess: entry.value.lastSuccess,
                ),
      },
    );
  }

  static CacheKey _metadataKey(String userId, String workspaceId) => CacheKey(
    namespace: 'offline.preparation.metadata',
    userId: userId,
    workspaceId: workspaceId,
  );

  static Future<Map<String, DateTime>> _loadMetadata(
    String userId,
    String workspaceId,
  ) async {
    final cached = await CacheStore.instance.read<Map<String, DateTime>>(
      key: _metadataKey(userId, workspaceId),
      decode: (json) => {
        if (json is Map)
          for (final entry in json.entries)
            if (entry.value is String &&
                DateTime.tryParse(entry.value as String) != null)
              entry.key as String: DateTime.parse(entry.value as String),
      },
    );
    return cached.data ?? {};
  }

  static Future<void> _writeMetadata(
    String userId,
    String workspaceId,
    Map<String, DateTime> completed,
  ) => CacheStore.instance.write(
    key: _metadataKey(userId, workspaceId),
    policy: const CachePolicy(
      staleAfter: Duration(days: 365),
      expireAfter: Duration(days: 365),
      refreshOnResume: false,
      refreshOnReconnect: false,
      allowBackgroundRefresh: false,
    ),
    payload: {
      for (final entry in completed.entries)
        entry.key: entry.value.toIso8601String(),
    },
  );
}
