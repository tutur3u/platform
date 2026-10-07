part of 'assistant_repository.dart';

mixin _AssistantSoulRepository {
  ApiClient get _apiClient;

  Future<AssistantSoul> fetchSoul({bool forceRefresh = false}) async =>
      (await fetchSoulSnapshot(forceRefresh: forceRefresh)).displaySoul;

  Future<AssistantSoulSnapshot> fetchSoulSnapshot({
    bool forceRefresh = false,
  }) => AssistantSoulReader(
    apiClient: _apiClient,
  ).read(forceRefresh: forceRefresh);

  Future<AssistantSoul> updateSoulName(String name) async =>
      (await updateSoulNameSnapshot(name)).displaySoul;

  Future<AssistantSoulSnapshot> updateSoulNameSnapshot(String name) =>
      AssistantSoulNameWriter(apiClient: _apiClient).renameSnapshot(name);
}
