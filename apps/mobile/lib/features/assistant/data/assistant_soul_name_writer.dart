import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_policy.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

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
  CacheKey get key => CacheKey(
    namespace: 'assistant.soul',
    userId: currentUserId(),
    locale: currentCacheLocaleTag(),
  );
  static AssistantSoul decode(Object? json) {
    if (json is! Map) {
      throw const FormatException('Invalid assistant soul cache payload.');
    }
    return AssistantSoul.fromJson(Map<String, dynamic>.from(json));
  }

  static final _intents = Expando<Map<String, int>>();

  Future<AssistantSoul> rename(String name) async {
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
      decode: decode,
    );
    checkScope();
    final soul = await queueOrSendValue<AssistantSoul>(
      feature: 'assistant',
      method: 'PATCH',
      path: '/api/v1/mira/soul',
      workspaceId: 'personal',
      entityId: 'soul',
      payload: {'name': value},
      expectedUserId: actor,
      checkScope: checkScope,
      queue: queue,
      pendingValue: (_) =>
          (current.data ?? const AssistantSoul()).copyWith(name: value),
      send: () async {
        checkScope();
        final response = await ApiClient.runForUser(
          actor,
          () => apiClient.patchJson('/api/v1/mira/soul', {'name': value}),
        );
        checkScope();
        final receipt = response['soul'];
        if (receipt is! Map<String, dynamic> ||
            receipt['name'] is! String ||
            (receipt['name'] as String).trim().isEmpty ||
            (receipt['name'] as String).length > 50 ||
            (receipt['user_id'] != null && receipt['user_id'] != actor) ||
            const [
              'tone',
              'personality',
              'boundaries',
              'vibe',
              'push_tone',
              'chat_tone',
            ].any(
              (field) => receipt[field] != null && receipt[field] is! String,
            )) {
          throw const FormatException('Assistant name update not confirmed');
        }
        return AssistantSoul.fromJson(receipt);
      },
    );
    await store.write(
      key: capturedKey,
      checkScope: checkScope,
      requirePublication: true,
      policy: CachePolicies.metadata,
      payload: soul.toJson(),
      tags: ['assistant:metadata', 'module:assistant'],
    );
    checkScope();
    return soul;
  }
}
