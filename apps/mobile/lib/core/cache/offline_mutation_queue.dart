import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/chat_attachment_delivery.dart';
import 'package:mobile/core/cache/drive_upload_delivery.dart';
import 'package:mobile/core/cache/offline_id_reconciliation.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

typedef OfflineMutationDispatcher =
    Future<void> Function(PendingMutationRecord record);

String newLocalMutationId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
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
    List<ConnectivityResult> connectivity;
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

  Future<void> _dispatchHttpMutation(PendingMutationRecord record) async {
    final api = ApiClient();
    try {
      final userId = record.userId;
      final workspaceId = record.workspaceId;
      final ids = userId == null || workspaceId == null
          ? const <String, String>{}
          : await CacheStore.instance.localIdMappings(
              userId: userId,
              workspaceId: workspaceId,
              feature: record.feature,
            );
      final resolved = reconcileOfflineIds(record.path, record.payload, ids);
      switch (record.method.toUpperCase()) {
        case 'POST':
          final response = await api.postJson(resolved.path, resolved.payload);
          if (record.feature == 'mail' &&
              record.path.endsWith('/messages') &&
              (response['message'] as Map<String, dynamic>?)?['status'] !=
                  'sent') {
            throw const ApiException(
              message: 'Mail delivery needs review',
              statusCode: 409,
            );
          }
          if (record.feature == 'tasks' &&
              record.path.endsWith('/tasks/bulk') &&
              (response['failCount'] as num? ?? 0) > 0) {
            throw const ApiException(
              message: 'Bulk task edit partially applied; review required',
              statusCode: 409,
            );
          }
          final localId = record.entityId;
          final serverId = createdServerId(response);
          if (userId != null &&
              workspaceId != null &&
              record.feature != 'drive' &&
              localId != null &&
              serverId != null &&
              localId != serverId) {
            await CacheStore.instance.saveLocalIdMapping(
              userId: userId,
              workspaceId: workspaceId,
              feature: record.feature,
              localId: localId,
              serverId: serverId,
            );
          }
        case 'PUT':
          await api.putJson(resolved.path, resolved.payload ?? {});
        case 'PATCH':
          await api.patchJson(resolved.path, resolved.payload ?? {});
        case 'DELETE':
          await api.deleteJson(resolved.path, body: resolved.payload);
        case 'MAIL_READ_ALL':
          String? cursor;
          String? before;
          do {
            final response = await api.postJson(resolved.path, {
              ...?resolved.payload,
              if (cursor != null) 'cursor': cursor,
              if (before != null) 'before': before,
            });
            cursor = response['nextCursor'] as String?;
            before = response['before'] as String?;
          } while (cursor != null);
        case 'MULTIPART_POST':
          final payload = resolved.payload ?? {};
          await api.sendMultipart(
            'POST',
            resolved.path,
            fields: {
              'clientAttachmentId': payload['clientAttachmentId'] as String,
            },
            files: [
              ApiMultipartFile.bytes(
                field: 'file',
                bytes: base64Decode(payload['bytes'] as String),
                filename: payload['filename'] as String,
              ),
            ],
          );
        case 'DRIVE_UPLOAD':
          if (workspaceId == null) {
            throw StateError('Drive upload has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            await deliverDriveUpload(
              api: api,
              httpClient: httpClient,
              workspaceId: workspaceId,
              filename: payload['filename'] as String,
              bytes: base64Decode(payload['bytes'] as String),
              contentType: payload['contentType'] as String,
              directoryPath: payload['directoryPath'] as String?,
            );
          } finally {
            httpClient.close();
          }
        case 'CHAT_UPLOAD':
          if (workspaceId == null) {
            throw StateError('Chat upload has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            final attachment = await deliverChatAttachment(
              api: api,
              httpClient: httpClient,
              uploadPath: resolved.path,
              filename: payload['filename'] as String,
              contentType: payload['contentType'] as String,
              bytes: base64Decode(payload['bytes'] as String),
            );
            final serverPath =
                attachment['storage_path'] ??
                attachment['storagePath'] ??
                attachment['path'];
            if (userId != null &&
                record.entityId != null &&
                serverPath is String &&
                serverPath.isNotEmpty) {
              await CacheStore.instance.saveLocalIdMapping(
                userId: userId,
                workspaceId: workspaceId,
                feature: 'chat',
                localId: record.entityId!,
                serverId: serverPath,
              );
            }
          } finally {
            httpClient.close();
          }
        default:
          throw StateError('Unsupported queued method: ${record.method}');
      }
    } finally {
      api.dispose();
    }
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
    if (_isDraining) return;
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
      for (final record in records) {
        if (record.userId != currentCacheUserId()) continue;
        final scope = (record.feature, record.workspaceId);
        if (record.status != PendingMutationStatus.queued) {
          blockedScopes.add(scope);
          continue;
        }
        if (blockedScopes.contains(scope)) continue;
        final dispatcher = _dispatchers[record.feature] ?? _dispatchers['*'];
        if (dispatcher == null) {
          blockedScopes.add(scope);
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
