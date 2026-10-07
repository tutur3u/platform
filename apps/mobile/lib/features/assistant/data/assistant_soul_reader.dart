import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_soul_receipts.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/models/assistant_soul_snapshot.dart';

class AssistantSoulReader {
  AssistantSoulReader({
    required this.apiClient,
    CacheStore? store,
    OfflineMutationQueue? queue,
    String? Function()? currentUserId,
  }) : store = store ?? CacheStore.instance,
       queue = queue ?? OfflineMutationQueue.instance,
       currentUserId = currentUserId ?? currentCacheUserId;
  final ApiClient apiClient;
  final CacheStore store;
  final OfflineMutationQueue queue;
  final String? Function() currentUserId;

  Future<AssistantSoulSnapshot> read({bool forceRefresh = false}) async {
    final actor = currentUserId();
    if (actor == null) throw StateError('Assistant owner unavailable');
    final key = verifiedSoulKey(actor);
    final epoch = store.scopeRevisionFor(key);
    void checkScope() {
      if (currentUserId() != actor || store.scopeRevisionFor(key) != epoch) {
        throw StateError('Assistant soul reader scope changed');
      }
    }

    checkScope();
    final result = await store.prefetch<AssistantSoul>(
      key: key,
      policy: CachePolicies.metadata,
      decode: (json) => decodeVerifiedSoul(json, actor),
      checkScope: checkScope,
      forceRefresh: forceRefresh,
      tags: ['assistant:metadata', 'module:assistant'],
      fetch: () async {
        checkScope();
        try {
          final response = await ApiClient.runForUser(
            actor,
            () => apiClient.getJson(assistantSoulPath),
          );
          checkScope();
          return verifiedSoulPayload(
            decodeSoulReceipt(response['soul'], actor),
            actor,
          );
        } on Object {
          checkScope();
          rethrow;
        }
      },
    );
    checkScope();
    if (result.data == null) {
      throw StateError('Assistant soul read invalidated');
    }
    final pending = await readAssistantNameIntents(queue, actor, checkScope);
    checkScope();
    return AssistantSoulSnapshot(
      verifiedSoul: result.data,
      pendingIntents: pending,
    );
  }
}
