import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Banner receipts make ambiguous delivery and cleanup failures replay-safe.
Future<void> queueBannerWrite({
  required String actor,
  required String method,
  required String path,
  required Map<String, dynamic> payload,
  required Future<void> Function() send,
  required String? Function() currentActor,
  OfflineMutationQueue? queue,
}) async {
  final mutations = queue ?? OfflineMutationQueue.instance;
  try {
    await queueOrSendVoid(
      feature: 'profile',
      method: method,
      path: path,
      workspaceId: 'personal',
      entityId: actor,
      payload: payload,
      replaySafe: true,
      send: send,
      queue: mutations,
      expectedUserId: actor,
    );
  } on ApiException catch (error) {
    if (error.statusCode < 500 || currentActor() != actor) rethrow;
    // Keep the original operation ID and the actual server error. A retry can
    // clean a committed receipt without applying it over a newer banner.
    await mutations.enqueue(
      PendingMutationRecord(
        id: newLocalMutationId(),
        feature: 'profile',
        method: method,
        path: path,
        createdAt: DateTime.now().toUtc(),
        userId: actor,
        workspaceId: 'personal',
        payload: payload,
        replaySafe: true,
        lastError: error.message,
      ),
    );
  }
}
