import 'dart:async';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Shared path for repository writes that do not return a server-created value.
/// Ambiguous network failures remain visible for manual review unless the
/// endpoint explicitly offers a stable client ID for replay.
Future<void> queueOrSendVoid({
  required String feature,
  required String method,
  required String path,
  required String workspaceId,
  required Future<void> Function() send,
  Map<String, dynamic>? payload,
  String? entityId,
  bool replaySafe = false,
  OfflineMutationQueue? queue,
}) async {
  final mutations = queue ?? OfflineMutationQueue.instance;
  final localId = entityId ?? newLocalMutationId();
  if (await mutations.enqueueIfOffline(
    feature: feature,
    method: method,
    path: path,
    workspaceId: workspaceId,
    payload: payload,
    entityId: localId,
    replaySafe: replaySafe,
  )) {
    return;
  }
  try {
    await send();
  } on ApiException catch (error) {
    if (!await mutations.enqueueAfterNetworkFailure(
      error: error,
      feature: feature,
      method: method,
      path: path,
      workspaceId: workspaceId,
      payload: payload ?? const {},
      entityId: localId,
      replaySafe: replaySafe,
    )) {
      rethrow;
    }
  } on Object catch (error) {
    if (error is! SocketException &&
        error is! TimeoutException &&
        error is! http.ClientException) {
      rethrow;
    }
    final queued = await mutations.enqueueAfterNetworkFailure(
      error: const ApiException(message: 'Network unavailable', statusCode: 0),
      feature: feature,
      method: method,
      path: path,
      workspaceId: workspaceId,
      payload: payload ?? const {},
      entityId: localId,
      replaySafe: replaySafe,
    );
    if (!queued) rethrow;
  }
}

/// Queues a model-returning mutation and supplies a local representation until
/// the server acknowledges it. Callers should mark that representation pending.
Future<T> queueOrSendValue<T>({
  required String feature,
  required String method,
  required String path,
  required String workspaceId,
  required Future<T> Function() send,
  required T Function(String entityId) pendingValue,
  Map<String, dynamic>? payload,
  String? entityId,
  bool replaySafe = false,
  OfflineMutationQueue? queue,
}) async {
  final mutations = queue ?? OfflineMutationQueue.instance;
  final localId = entityId ?? newLocalMutationId();
  if (await mutations.enqueueIfOffline(
    feature: feature,
    method: method,
    path: path,
    workspaceId: workspaceId,
    payload: payload,
    entityId: localId,
    replaySafe: replaySafe,
  )) {
    return pendingValue(localId);
  }
  try {
    return await send();
  } on ApiException catch (error) {
    if (await mutations.enqueueAfterNetworkFailure(
      error: error,
      feature: feature,
      method: method,
      path: path,
      workspaceId: workspaceId,
      payload: payload ?? const {},
      entityId: localId,
      replaySafe: replaySafe,
    )) {
      return pendingValue(localId);
    }
    rethrow;
  } on Object catch (error) {
    if (error is! SocketException &&
        error is! TimeoutException &&
        error is! http.ClientException) {
      rethrow;
    }
    if (await mutations.enqueueAfterNetworkFailure(
      error: const ApiException(message: 'Network unavailable', statusCode: 0),
      feature: feature,
      method: method,
      path: path,
      workspaceId: workspaceId,
      payload: payload ?? const {},
      entityId: localId,
      replaySafe: replaySafe,
    )) {
      return pendingValue(localId);
    }
    rethrow;
  }
}
