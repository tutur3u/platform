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
}) async {
  final localId = entityId ?? newLocalMutationId();
  if (await OfflineMutationQueue.instance.enqueueIfOffline(
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
    if (!await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
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
  }
}
