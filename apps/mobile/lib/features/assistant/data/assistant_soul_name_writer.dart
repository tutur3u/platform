import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/data/assistant_soul_receipts.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/models/assistant_soul_snapshot.dart';

/// Captures one personal name intent through cache, queue, and HTTP admission.
class AssistantSoulNameWriter {
  AssistantSoulNameWriter({
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
  CacheKey get key {
    final actor = currentUserId();
    if (actor == null) throw StateError('Assistant owner unavailable');
    return verifiedSoulKey(actor);
  }

  static AssistantSoul decode(Object? json) {
    if (json is! Map || json['ownerId'] is! String) {
      throw const FormatException('Invalid verified assistant soul cache');
    }
    return decodeVerifiedSoul(json, json['ownerId'] as String);
  }

  static final _intents = Expando<Map<String, int>>();

  /// Compatibility display result; pending names are never presented confirmed.
  Future<AssistantSoul> rename(String name) async =>
      (await renameSnapshot(name)).displaySoul;

  Future<AssistantSoulSnapshot> renameSnapshot(String name) async {
    final capturedKey = key;
    final actor = capturedKey.userId;
    if (actor == null) throw StateError('Assistant owner unavailable');
    final value = name.trim();
    if (value.isEmpty || value.length > 50) {
      throw const FormatException('Invalid assistant name');
    }
    final epoch = store.scopeRevisionFor(capturedKey);
    final intents = _intents[store] ??= <String, int>{};
    final generation = (intents[capturedKey.value] ?? 0) + 1;
    intents[capturedKey.value] = generation;
    void checkScope() {
      if (currentUserId() != actor ||
          store.scopeRevisionFor(capturedKey) != epoch ||
          intents[capturedKey.value] != generation) {
        throw StateError('Assistant name intent changed');
      }
    }

    final current = await store.read<AssistantSoul>(
      key: capturedKey,
      decode: (json) => decodeVerifiedSoul(json, actor),
    );
    checkScope();
    final soul = await queueOrSendValue<AssistantSoul?>(
      feature: 'assistant',
      method: 'PATCH',
      path: '/api/v1/mira/soul',
      workspaceId: 'personal',
      entityId: 'soul',
      payload: {'name': value},
      expectedUserId: actor,
      checkScope: checkScope,
      queue: queue,
      pendingValue: (_) => null,
      send: () async {
        checkScope();
        final response = await ApiClient.runForUser(
          actor,
          () => apiClient.patchJson('/api/v1/mira/soul', {'name': value}),
        );
        checkScope();
        final receipt = decodeSoulReceipt(response['soul'], actor);
        if (receipt.name.trim().isEmpty) {
          throw const FormatException('Assistant name update not confirmed');
        }
        return receipt;
      },
    );
    if (soul != null) {
      await store.write(
        key: capturedKey,
        checkScope: checkScope,
        requirePublication: true,
        policy: CachePolicies.metadata,
        payload: verifiedSoulPayload(soul, actor),
        tags: ['assistant:metadata', 'module:assistant'],
      );
    }
    checkScope();
    final pending = await readAssistantNameIntents(queue, actor, checkScope);
    checkScope();
    return AssistantSoulSnapshot(
      verifiedSoul: soul ?? current.data,
      pendingIntents: pending,
    );
  }
}
