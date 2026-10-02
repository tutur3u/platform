import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/chat_attachment_delivery.dart';
import 'package:mobile/core/cache/crm_avatar_delivery.dart';
import 'package:mobile/core/cache/drive_upload_delivery.dart';
import 'package:mobile/core/cache/offline_id_reconciliation.dart';
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

class OfflineMutationQueue {
  OfflineMutationQueue._();

  static final OfflineMutationQueue instance = OfflineMutationQueue._();

  final Map<String, OfflineMutationDispatcher> _dispatchers = {};
  final ValueNotifier<List<PendingMutationRecord>> pending = ValueNotifier([]);
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  StreamSubscription<supa.AuthState>? _authSubscription;
  Timer? _retryTimer;
  bool _isDraining = false;
  bool _drainRequested = false;
  bool _initialized = false;

  Future<void> init() async {
    if (_initialized) return;
    await CacheStore.instance.init();
    _connectivitySubscription = Connectivity().onConnectivityChanged.listen((
      results,
    ) {
      final online = results.any((result) => result != ConnectivityResult.none);
      if (online) {
        unawaited(drain());
      }
    });
    _authSubscription = maybeSupabase?.auth.onAuthStateChange.listen((_) {
      unawaited(refresh());
    });
    _initialized = true;
    await refresh();
    _dispatchers.putIfAbsent('*', () => _dispatchHttpMutation);
    unawaited(drain());
  }

  Future<bool> enqueueIfOffline({
    required String feature,
    required String method,
    required String path,
    required String workspaceId,
    Map<String, dynamic>? payload,
    String? entityId,
    bool replaySafe = false,
  }) async {
    final hasPendingDependency = pending.value.any(
      (item) =>
          item.userId == currentCacheUserId() &&
          item.workspaceId == workspaceId &&
          (item.feature == feature ||
              (item.feature == 'workspace' &&
                  item.method == 'WORKSPACE_CREATE') ||
              referencesPendingEntity(path, payload, item.entityId)),
    );
    List<ConnectivityResult> connectivity;
    if (!hasPendingDependency) {
      try {
        connectivity = await Connectivity().checkConnectivity();
      } on Object {
        // A missing platform signal must not silently turn an online write into
        // a queued write (notably on desktop and in widget tests).
        return false;
      }
      if (connectivity.any((result) => result != ConnectivityResult.none)) {
        return false;
      }
    }
    await enqueue(
      PendingMutationRecord(
        id: newLocalMutationId(),
        feature: feature,
        method: method,
        path: path,
        createdAt: DateTime.now().toUtc(),
        userId: currentCacheUserId(),
        workspaceId: workspaceId,
        payload: payload,
        optimisticPatch: entityId == null ? null : {'entityId': entityId},
        replaySafe: replaySafe,
      ),
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
  }) async {
    if (error.statusCode != 0) return false;
    await enqueue(
      PendingMutationRecord(
        id: newLocalMutationId(),
        feature: feature,
        method: method,
        path: path,
        createdAt: DateTime.now().toUtc(),
        userId: currentCacheUserId(),
        workspaceId: workspaceId,
        payload: payload,
        optimisticPatch: {'entityId': entityId},
        replaySafe: replaySafe,
        status: replaySafe
            ? PendingMutationStatus.queued
            : PendingMutationStatus.conflict,
        lastError: error.message,
      ),
    );
    return true;
  }

  void registerDispatcher(
    String feature,
    OfflineMutationDispatcher dispatcher,
  ) {
    _dispatchers[feature] = dispatcher;
    unawaited(drain());
  }

  Future<void> enqueue(PendingMutationRecord record) async {
    await init();
    if (record.userId == null || record.userId != currentCacheUserId()) {
      throw StateError('An authenticated account is required to queue edits');
    }
    await CacheStore.instance.savePendingMutation(record);
    await refresh();
    if (_isDraining) {
      _drainRequested = true;
    } else {
      unawaited(drain());
    }
  }

  Future<void> cancel(String id) async {
    await init();
    await CacheStore.instance.deletePendingMutation(id);
    await refresh();
  }

  Future<List<PendingMutationRecord>> listPending() async {
    await init();
    return (await CacheStore.instance.listPendingMutations())
        .where((record) => record.userId == currentCacheUserId())
        .toList(growable: false);
  }

  Future<void> refresh() async {
    await CacheStore.instance.init();
    pending.value = (await CacheStore.instance.listPendingMutations())
        .where((record) => record.userId == currentCacheUserId())
        .toList(growable: false);
  }

  Future<void> retry(String id) async {
    final record = (await listPending())
        .where((item) => item.id == id)
        .firstOrNull;
    if (record == null) return;
    await CacheStore.instance.savePendingMutation(
      record.copyWith(status: PendingMutationStatus.queued),
    );
    await refresh();
    await drain();
  }

  Future<void> drain() async {
    if (_isDraining) {
      _drainRequested = true;
      return;
    }
    try {
      final connectivity = await Connectivity().checkConnectivity();
      if (connectivity.every((result) => result == ConnectivityResult.none)) {
        return;
      }
    } on Object {
      return;
    }
    _isDraining = true;
    try {
      final records = await listPending();
      final blockedScopes = <(String, String?)>{};
      final unresolvedEarlier = <(String?, String)>{};
      void remember(PendingMutationRecord record) {
        final id = record.entityId;
        if (id != null) unresolvedEarlier.add((record.workspaceId, id));
      }

      for (final record in records) {
        if (record.userId != currentCacheUserId()) continue;
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

        try {
          await dispatcher(record);
          await CacheStore.instance.deletePendingMutation(record.id);
        } on Exception catch (error) {
          final status = switch (error) {
            ApiException(statusCode: 409 || 412) =>
              PendingMutationStatus.conflict,
            ApiException(statusCode: 401 || 403) =>
              PendingMutationStatus.failed,
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
          await CacheStore.instance.savePendingMutation(nextRecord);
          if (status == PendingMutationStatus.queued) {
            final exponent = nextRecord.attemptCount.clamp(1, 6);
            final seconds = min(120, 1 << exponent);
            _retryTimer?.cancel();
            _retryTimer = Timer(Duration(seconds: seconds), () {
              unawaited(drain());
            });
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
        }
      }
    } finally {
      await refresh();
      _isDraining = false;
      if (_drainRequested) {
        _drainRequested = false;
        unawaited(drain());
      }
    }
  }

  bool _isRetryable(Object error) {
    if (error is ApiException) {
      return error.statusCode == 0 ||
          error.statusCode == 429 ||
          error.statusCode >= 500;
    }
    final normalized = error.toString().toLowerCase();
    return normalized.contains('socket') ||
        normalized.contains('network') ||
        normalized.contains('connection') ||
        normalized.contains('timeout');
  }

  Future<void> dispose() async {
    _retryTimer?.cancel();
    _retryTimer = null;
    await _connectivitySubscription?.cancel();
    await _authSubscription?.cancel();
    _connectivitySubscription = null;
    _authSubscription = null;
    _initialized = false;
  }
}
