import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/chat_attachment_delivery.dart';
import 'package:mobile/core/cache/crm_avatar_delivery.dart';
import 'package:mobile/core/cache/drive_upload_delivery.dart';
import 'package:mobile/core/cache/offline_dependency_graph.dart';
import 'package:mobile/core/cache/offline_id_reconciliation.dart';
import 'package:mobile/core/cache/offline_inventory_create.dart';
import 'package:mobile/core/cache/offline_inventory_mutation.dart';
import 'package:mobile/core/cache/offline_inventory_persistence.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/core/cache/offline_resource_reference.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/cache/profile_avatar_delivery.dart';
import 'package:mobile/core/cache/task_description_image_delivery.dart';
import 'package:mobile/core/cache/time_request_image_delivery.dart';
import 'package:mobile/core/cache/workspace_avatar_delivery.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

part 'offline_mutation_dispatch.dart';
part 'offline_mutation_dependencies.dart';
part 'offline_inventory_replay.dart';

typedef OfflineMutationDispatcher =
    Future<void> Function(PendingMutationRecord record);

String newLocalMutationId({bool timeOrdered = false}) {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  if (timeOrdered) {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    for (var index = 0; index < 6; index++) {
      bytes[index] = (timestamp >> ((5 - index) * 8)) & 0xff;
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | (timeOrdered ? 0x70 : 0x40);
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  final hex = bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-'
      '${hex.substring(12, 16)}-${hex.substring(16, 20)}-'
      '${hex.substring(20)}';
}

class OfflineMutationQueue with WidgetsBindingObserver {
  OfflineMutationQueue._()
    : _store = CacheStore.instance,
      _userId = currentCacheUserId,
      _checkConnectivity = Connectivity().checkConnectivity,
      _connectivityChanges = Connectivity().onConnectivityChanged,
      _authChanges = null,
      _apiFactory = null,
      _now = DateTime.now;

  @visibleForTesting
  OfflineMutationQueue.forTesting({
    required CacheStore store,
    required String? Function() userId,
    required Future<List<ConnectivityResult>> Function() checkConnectivity,
    required Stream<List<ConnectivityResult>> connectivityChanges,
    Stream<supa.AuthState>? authChanges,
    ApiClient Function(String userId)? apiFactory,
    DateTime Function()? now,
  }) : _store = store,
       _userId = userId,
       _checkConnectivity = checkConnectivity,
       _connectivityChanges = connectivityChanges,
       _authChanges = authChanges,
       _apiFactory = apiFactory,
       _now = now ?? DateTime.now;

  final DateTime Function() _now;
  final CacheStore _store;
  final ApiClient Function(String userId)? _apiFactory;
  final String? Function() _userId;
  final Future<List<ConnectivityResult>> Function() _checkConnectivity;
  final Stream<List<ConnectivityResult>> _connectivityChanges;
  final Stream<supa.AuthState>? _authChanges;

  static final OfflineMutationQueue instance = OfflineMutationQueue._();

  final Map<String, OfflineMutationDispatcher> _dispatchers = {};
  final Set<String> _cancelingIds = {};
  final Map<String, Map<String, dynamic>?> _foregroundInventoryResults = {};
  final Map<String, Exception> _foregroundInventoryErrors = {};
  final Map<String, ApiClient> _foregroundInventoryClients = {};
  final ValueNotifier<List<PendingMutationRecord>> pending = ValueNotifier([]);
  final ValueNotifier<Set<String>> syncingIds = ValueNotifier({});
  final ValueNotifier<int> syncRevision = ValueNotifier(0);
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  StreamSubscription<supa.AuthState>? _authSubscription;
  Timer? _retryTimer;
  Future<void>? _drainFuture;
  DateTime? _serverCooldownUntil;
  DateTime? _contractUnavailableUntil;
  Future<void>? _initialization;
  Future<void>? _syncFuture;
  bool _syncRequested = false;
  bool _resumeRequested = false;
  bool _drainRequested = false;
  bool _initialized = false;
  bool _disposed = false;

  void _checkOpen() {
    if (_disposed) throw StateError('Offline mutation queue is disposed');
  }

  Future<void> init() {
    if (_disposed) {
      return Future<void>.error(
        StateError('Offline mutation queue is disposed'),
      );
    }
    if (_initialized) return Future<void>.value();
    return _initialization ??= _initialize().whenComplete(() {
      _initialization = null;
    });
  }

  Future<void> _initialize() async {
    await _store.init();
    if (_disposed) return;
    // Backfill legacy queued creates once, not on each dependency scan.
    for (final record in await _store.listPendingMutations()) {
      if (_disposed) return;
      await _registerInventoryProvenance(record);
    }
    if (_disposed) return;
    _dispatchers.putIfAbsent('*', () => _dispatchHttpMutation);
    _connectivitySubscription = _connectivityChanges.listen((results) {
      if (results.any((result) => result != ConnectivityResult.none)) {
        _scheduleSync();
      }
    }, onError: (Object _) {});
    _authSubscription = (_authChanges ?? maybeSupabase?.auth.onAuthStateChange)
        ?.listen((state) {
          if (state.event == supa.AuthChangeEvent.signedIn ||
              state.event == supa.AuthChangeEvent.tokenRefreshed ||
              state.event == supa.AuthChangeEvent.mfaChallengeVerified) {
            _scheduleSync();
          } else {
            unawaited(refresh());
          }
        }, onError: (Object _) {});
    WidgetsBinding.instance.addObserver(this);
    _initialized = true;
    await refresh();
    _scheduleSync();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _scheduleSync(onResume: true);
  }

  void _scheduleSync({bool onResume = false}) {
    if (_disposed) return;
    unawaited(
      synchronize(onResume: onResume).then<void>(
        (_) {},
        onError: (Object _) {
          debugPrint('Offline sync unavailable; edits remain stored.');
        },
      ),
    );
  }

  /// Replay edits before revalidating visited resources.
  Future<void> synchronize({bool onResume = false}) {
    if (_disposed) return Future<void>.value();
    _resumeRequested |= onResume;
    if (_syncFuture != null) {
      _syncRequested = true;
      return _syncFuture!;
    }
    return _syncFuture = _synchronize().whenComplete(() {
      _syncFuture = null;
    });
  }

  Future<void> _synchronize() async {
    do {
      if (_disposed) return;
      _syncRequested = false;
      final onResume = _resumeRequested;
      _resumeRequested = false;
      await ApiClient.offlinePreparation(
        drain,
        allowChallenge: false,
        markBulk: false,
      );
      if (_disposed) return;
      try {
        final results = await _checkConnectivity();
        if (_disposed) return;
        if (!results.any((result) => result != ConnectivityResult.none)) {
          if (_syncRequested) continue;
          return;
        }
      } on Object {
        return;
      }
      if (_serverCooldownUntil != null &&
          _now().isBefore(_serverCooldownUntil!)) {
        continue;
      }
      await CacheStore.awaitRevalidation(() async {
        await ApiClient.offlinePreparation(
          () => _store.refreshCachedResources(
            currentUserId: () => _disposed ? null : _userId(),
            onResume: onResume,
          ),
          allowChallenge: false,
          markBulk: false,
        );
        // Visible projections inherit the same cycle and reuse its completed
        // requests, including when an earlier resource refresh has settled.
        if (!_disposed) syncRevision.value++;
      });
    } while (!_disposed && _syncRequested);
  }

  Future<bool> enqueueIfOffline({
    required String feature,
    required String method,
    required String path,
    required String workspaceId,
    Map<String, dynamic>? payload,
    String? entityId,
    bool replaySafe = false,
    String? expectedUserId,
    void Function()? checkScope,
  }) async {
    checkScope?.call();
    await init();
    checkScope?.call();
    if (expectedUserId != null && expectedUserId != _userId()) {
      throw StateError('Profile actor changed');
    }
    final hasPendingDependency = pending.value.any(
      (item) =>
          item.userId == _userId() &&
          item.workspaceId == workspaceId &&
          (item.feature == feature ||
              (item.feature == 'workspace' &&
                  item.method == 'WORKSPACE_CREATE') ||
              referencesPendingEntity(path, payload, item.entityId)),
    );
    List<ConnectivityResult> connectivity;
    if (!hasPendingDependency) {
      try {
        connectivity = await _checkConnectivity();
        _checkOpen();
        checkScope?.call();
      } on Object {
        _checkOpen();
        checkScope?.call();
        // A missing platform signal must not silently turn an online write into
        // a queued write (notably on desktop and in widget tests).
        return false;
      }
      if (connectivity.any((result) => result != ConnectivityResult.none)) {
        return false;
      }
    }
    if (expectedUserId != null && expectedUserId != _userId()) {
      throw StateError('Profile actor changed');
    }
    checkScope?.call();
    await enqueue(
      PendingMutationRecord(
        id: newLocalMutationId(),
        feature: feature,
        method: method,
        path: path,
        createdAt: _now().toUtc(),
        userId: expectedUserId ?? _userId(),
        workspaceId: workspaceId,
        payload: payload,
        optimisticPatch: entityId == null ? null : {'entityId': entityId},
        replaySafe: replaySafe,
      ),
      checkScope: checkScope,
    );
    return true;
  }

  /// A connected interface can still have no route to the API. Only a
  /// server-deduplicated operation is safe to replay after an uncertain send.
  Future<bool> enqueueAfterNetworkFailure({
    required ApiException error,
    required String feature,
    required String method,
    required String path,
    required String workspaceId,
    required Map<String, dynamic> payload,
    required String entityId,
    required bool replaySafe,
    String? expectedUserId,
    void Function()? checkScope,
  }) async {
    if (!isOfflineTransportFailure(error) &&
        !(replaySafe && error.code == 'OFFLINE_CONTRACT_UNAVAILABLE')) {
      return false;
    }
    if (expectedUserId != null && expectedUserId != _userId()) {
      throw StateError('Profile actor changed');
    }
    checkScope?.call();
    await enqueue(
      PendingMutationRecord(
        id: newLocalMutationId(),
        feature: feature,
        method: method,
        path: path,
        createdAt: _now().toUtc(),
        userId: expectedUserId ?? _userId(),
        workspaceId: workspaceId,
        payload: payload,
        optimisticPatch: {'entityId': entityId},
        replaySafe: replaySafe,
        status: replaySafe
            ? PendingMutationStatus.queued
            : PendingMutationStatus.conflict,
        lastError: error.message,
      ),
      checkScope: checkScope,
    );
    return true;
  }

  void registerDispatcher(
    String feature,
    OfflineMutationDispatcher dispatcher,
  ) {
    _dispatchers[feature] = dispatcher;
    _scheduleSync();
  }

  Future<void> enqueue(
    PendingMutationRecord record, {
    void Function()? checkScope,
  }) async {
    checkScope?.call();
    await init();
    checkScope?.call();
    if (record.userId == null || record.userId != _userId()) {
      throw StateError('An authenticated account is required to queue edits');
    }
    _checkOpen();
    await _registerInventoryProvenance(record);
    _checkOpen();
    checkScope?.call();
    await _store.savePendingMutation(
      record,
      checkScope: () {
        _checkOpen();
        checkScope?.call();
        if (record.userId != _userId()) {
          throw StateError('Pending mutation actor changed');
        }
      },
    );
    await _pinInventoryDependencies(await listPending());
    await refresh();
    _drainRequested = true;
    _scheduleSync();
  }

  Future<bool> cancel(String id) async {
    await init();
    if (syncingIds.value.contains(id)) return false;
    final existing = (await listPending())
        .where((record) => record.id == id)
        .firstOrNull;
    if (existing?.acknowledgedServerId != null ||
        existing?.acknowledgedDeletedId != null ||
        existing?.acknowledgedWrite == true) {
      _scheduleSync();
      return false;
    }
    if (syncingIds.value.contains(id)) return false;
    _cancelingIds.add(id);
    try {
      await _store.deletePendingMutation(id);
      await refresh();
      return true;
    } finally {
      final drain = _drainFuture;
      if (drain == null) {
        _cancelingIds.remove(id);
      } else {
        unawaited(drain.whenComplete(() => _cancelingIds.remove(id)));
      }
    }
  }

  Future<List<PendingMutationRecord>> listPending() async {
    await init();
    return (await _store.listPendingMutations())
        .where((record) => record.userId == _userId())
        .toList(growable: false);
  }

  Future<void> refresh() async {
    if (_disposed) return;
    await _store.init();
    if (_disposed) return;
    final records = await _store.listPendingMutations();
    if (_disposed) return;
    pending.value = records
        .where((record) => record.userId == _userId())
        .toList(growable: false);
  }

  Future<void> retry(String id) async {
    final record = (await listPending())
        .where((item) => item.id == id)
        .firstOrNull;
    if (record == null || !record.canRetry) return;
    await _store.savePendingMutation(
      record.copyWith(status: PendingMutationStatus.queued),
    );
    await refresh();
    await drain();
    await synchronize();
  }

  Future<void> drain() {
    if (_disposed) return Future<void>.value();
    if (_drainFuture != null) return _drainFuture!;
    return _drainFuture = _drain().whenComplete(() {
      _drainFuture = null;
    });
  }

  Future<void> _drain() async {
    await init();
    if (_disposed) return;
    do {
      _drainRequested = false;
      await _drainOnce();
    } while (!_disposed && _drainRequested);
  }

  Future<void> _drainOnce() async {
    if (_serverCooldownUntil != null &&
        _now().isBefore(_serverCooldownUntil!)) {
      return;
    }
    try {
      final connectivity = await _checkConnectivity();
      if (_disposed) return;
      if (connectivity.every((result) => result == ConnectivityResult.none)) {
        return;
      }
    } on Object {
      return;
    }
    try {
      final inventoryRecords = (await listPending())
          .where(
            (record) => OfflineInventoryMutation.fromRecord(record) != null,
          )
          .toList();
      if (_disposed) return;
      if (await _drainInventoryDependencies(inventoryRecords)) return;
      if (_disposed) return;
      final records = await listPending();
      final blockedScopes = <(String, String?)>{};
      final unresolvedEarlier = <(String?, String)>{};
      void remember(PendingMutationRecord record) {
        final id = record.entityId;
        if (id != null) unresolvedEarlier.add((record.workspaceId, id));
      }

      for (final record in records) {
        if (_disposed) return;
        if (OfflineInventoryMutation.fromRecord(record) != null) continue;
        if (_cancelingIds.contains(record.id) ||
            record.userId == null ||
            record.userId != _userId()) {
          continue;
        }
        final scope = (record.feature, record.workspaceId);
        if (record.status != PendingMutationStatus.queued) {
          blockedScopes.add(scope);
          remember(record);
          continue;
        }
        if (blockedScopes.contains(scope) ||
            unresolvedEarlier.any(
              (entry) =>
                  entry.$1 == record.workspaceId &&
                  referencesPendingEntity(
                    record.path,
                    record.payload,
                    entry.$2,
                  ),
            )) {
          remember(record);
          continue;
        }
        final dispatcher = _dispatchers[record.feature] ?? _dispatchers['*'];
        if (dispatcher == null) {
          blockedScopes.add(scope);
          remember(record);
          continue;
        }

        syncingIds.value = {...syncingIds.value, record.id};
        try {
          await dispatcher(record);
          // An already dispatched ACK must be reconciled even after disposal.
          await _store.deletePendingMutation(record.id);
          if (_disposed) return;
          try {
            final module = record.feature == 'time_tracker'
                ? 'timer'
                : record.feature;
            await _store.invalidateTags(
              {'module:$module'},
              userId: record.userId,
              workspaceId: record.workspaceId,
            );
          } on Object {
            // A cache failure after acknowledgment must never resend a write.
          }
        } on Exception catch (error) {
          final status = switch (error) {
            ApiException(statusCode: 409 || 412) =>
              PendingMutationStatus.conflict,
            ApiException(statusCode: 401 || 429) =>
              PendingMutationStatus.queued,
            ApiException(isVerificationRequired: true) =>
              PendingMutationStatus.queued,
            ApiException(statusCode: 403) => PendingMutationStatus.failed,
            _ when _isRetryable(error) && !record.replaySafe =>
              PendingMutationStatus.conflict,
            _ when _isRetryable(error) => PendingMutationStatus.queued,
            _ => PendingMutationStatus.failed,
          };
          final nextRecord = record.copyWith(
            attemptCount: record.attemptCount + 1,
            lastError: error.toString(),
            status: status,
          );
          await _store.savePendingMutation(nextRecord);
          if (!_disposed &&
              status == PendingMutationStatus.queued &&
              !(error is ApiException &&
                  (error.statusCode == 401 || error.isVerificationRequired))) {
            final exponent = nextRecord.attemptCount.clamp(1, 6);
            final seconds = error is ApiException && error.statusCode == 429
                ? max(60, error.retryAfter ?? 60)
                : min(120, 1 << exponent);
            if (error is ApiException && error.statusCode == 429) {
              _serverCooldownUntil = _now().add(Duration(seconds: seconds));
            }
            _retryTimer?.cancel();
            _retryTimer = Timer(Duration(seconds: seconds), _scheduleSync);
          }
          // Edits inside a module/workspace can depend on a preceding create.
          // Other modules can keep syncing after a non-retryable conflict.
          blockedScopes.add(scope);
          remember(record);
          if (status == PendingMutationStatus.queued ||
              error is ApiException &&
                  (error.statusCode == 401 || error.statusCode == 403)) {
            break;
          }
        } finally {
          syncingIds.value = {...syncingIds.value}..remove(record.id);
        }
      }
    } finally {
      await refresh();
    }
  }

  bool _isRetryable(Object error) {
    if (isOfflineTransportFailure(error)) return true;
    if (error is ApiException) {
      if (error.code == 'OFFLINE_CONTRACT_RESPONSE_MISMATCH') return false;
      return error.statusCode == 429 || error.statusCode >= 500;
    }
    return false;
  }

  /// Closes admission immediately without waiting for blocked connectivity.
  /// Already dispatched writes retain their durable acknowledgment cleanup.
  Future<void> dispose() async {
    _disposed = true;
    _syncRequested = false;
    _resumeRequested = false;
    _drainRequested = false;
    WidgetsBinding.instance.removeObserver(this);
    _retryTimer?.cancel();
    _retryTimer = null;
    await _connectivitySubscription?.cancel();
    await _authSubscription?.cancel();
    _connectivitySubscription = null;
    _authSubscription = null;
    _initialized = false;
  }
}
