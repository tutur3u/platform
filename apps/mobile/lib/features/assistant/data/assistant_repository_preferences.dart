part of 'assistant_repository.dart';

String _favoritesPath(String wsId) =>
    '/api/v1/workspaces/${Uri.encodeComponent(wsId)}/ai/model-favorites';

Future<Set<String>> fetchAssistantModelFavorites(
  AssistantRepository repository,
  String wsId,
) async {
  final path = _favoritesPath(wsId);
  final result = await CacheStore.instance.prefetch<List<String>>(
    key: AssistantRepository._assistantMetadataCacheKey(
      namespace: 'assistant.model_favorites',
      wsId: wsId,
    ),
    policy: AssistantRepository._assistantMetadataCachePolicy,
    decode: (json) =>
        (json as List<dynamic>?)?.whereType<String>().toList() ?? [],
    tags: [
      AssistantRepository._assistantMetadataCacheTag,
      'workspace:$wsId',
      'module:assistant',
    ],
    fetch: () async {
      final payload = await repository._apiClient.getJson(path);
      return (payload['favoriteIds'] as List<dynamic>? ?? const [])
          .whereType<String>()
          .toList();
    },
  );
  final favorites = {...?result.data};
  for (final item in await OfflineMutationQueue.instance.listPending()) {
    if (item.feature != 'assistant' ||
        item.workspaceId != wsId ||
        item.path != path ||
        item.userId != currentCacheUserId()) {
      continue;
    }
    final modelId = item.payload?['modelId'] as String?;
    if (modelId == null) continue;
    if (item.payload?['isFavorited'] == true) {
      favorites.add(modelId);
    } else {
      favorites.remove(modelId);
    }
  }
  return favorites;
}

Future<void> toggleAssistantModelFavorite(
  AssistantRepository repository,
  String wsId,
  String modelId, {
  required bool isFavorited,
}) async {
  final path = _favoritesPath(wsId);
  final payload = {'modelId': modelId, 'isFavorited': isFavorited};
  await queueOrSendVoid(
    feature: 'assistant',
    method: 'PATCH',
    path: path,
    workspaceId: wsId,
    entityId: modelId,
    payload: payload,
    send: () async {
      await repository._apiClient.patchJson(path, payload);
    },
  );
  final queued = (await OfflineMutationQueue.instance.listPending()).any(
    (item) =>
        item.feature == 'assistant' &&
        item.workspaceId == wsId &&
        item.path == path &&
        item.payload?['modelId'] == modelId,
  );
  if (!queued) {
    await CacheStore.instance.invalidateTags({
      AssistantRepository._assistantMetadataCacheTag,
    }, workspaceId: wsId);
  }
}

Future<AssistantSoul> fetchAssistantSoul(
  AssistantRepository repository, {
  bool forceRefresh = false,
  CacheStore? store,
  OfflineMutationQueue? queue,
  String? Function()? currentUserId,
}) async => (await AssistantSoulReader(
  apiClient: repository._apiClient,
  store: store,
  queue: queue,
  currentUserId: currentUserId,
).read(forceRefresh: forceRefresh)).displaySoul;
