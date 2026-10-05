import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/cms/cms_models.dart';
import 'package:mobile/data/sources/api_client.dart';

class CmsRepository {
  CmsRepository({
    ApiClient? apiClient,
    CacheStore? cacheStore,
    OfflineMutationQueue? mutationQueue,
    this.expectedUserId,
    String? Function()? currentUserId,
  }) : _api = apiClient ?? ApiClient(expectedUserId: expectedUserId),
       _store = cacheStore ?? CacheStore.instance,
       _queue = mutationQueue ?? OfflineMutationQueue.instance,
       _currentUserId = currentUserId ?? currentCacheUserId;

  final String? expectedUserId;
  final ApiClient _api;
  final CacheStore _store;
  final OfflineMutationQueue _queue;

  final String? Function() _currentUserId;
  String? get _actor => expectedUserId ?? _currentUserId();

  void _checkActor(String? actor) {
    if (actor != null) _api.checkUser(actor);
    if (_actor != actor) {
      throw const ApiException(message: 'Account changed', statusCode: 401);
    }
  }

  Future<List<PendingMutationRecord>> _pendingForActor(String? actor) async {
    _checkActor(actor);
    if (actor == null) return const [];
    final records = await _queue.listPending();
    _checkActor(actor);
    return records.where((record) => record.userId == actor).toList();
  }

  Future<void> _invalidate(String wsId, String? actor) =>
      _store.invalidateTags({'module:cms'}, workspaceId: wsId, userId: actor);

  Future<CmsSummary> getSummary(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final response = await readThroughJson(
      api: _api,
      namespace: 'cms.summary',
      workspaceId: wsId,
      path: CmsEndpoints.summary(wsId),
      forceRefresh: forceRefresh,
      cacheStore: _store,
      cacheUserId: () => actor,
    );
    _checkActor(actor);
    return CmsSummary.fromJson(response);
  }

  Future<List<CmsCollection>> listCollections(
    String wsId, {
    bool forceRefresh = false,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final response = await readThroughJsonList(
      api: _api,
      namespace: 'cms.collections',
      workspaceId: wsId,
      path: CmsEndpoints.collections(wsId),
      forceRefresh: forceRefresh,
      cacheStore: _store,
      cacheUserId: () => actor,
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'cms',
      pathContains: '/external-projects/collections',
      source: response.whereType<Map<String, dynamic>>().toList(
        growable: false,
      ),
      pending: await _pendingForActor(actor),
      normalizeCreate: (payload) => {...payload, 'is_enabled': true},
    );
    return rows.map(CmsCollection.fromJson).toList(growable: false);
  }

  Future<CmsCollection> createCollection(
    String wsId, {
    required String title,
    required String slug,
    required String collectionType,
    String? description,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final path = CmsEndpoints.collections(wsId);
    final payload = <String, dynamic>{
      'title': title,
      'slug': slug,
      'collection_type': collectionType,
      'description': description,
      'config': <String, dynamic>{},
    };
    final result = await queueOrSendValue<CmsCollection>(
      feature: 'cms',
      expectedUserId: actor,
      queue: _queue,
      apiClient: _api,
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) =>
          CmsCollection.fromJson({...payload, 'id': id, 'is_enabled': true}),
      send: () async =>
          CmsCollection.fromJson(await _api.postJson(path, payload)),
    );
    await _invalidate(wsId, actor);
    return result;
  }

  Future<CmsCollection> updateCollection(
    String wsId,
    String collectionId, {
    required String title,
    required String slug,
    required String collectionType,
    required bool isEnabled,
    String? description,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final path = CmsEndpoints.collection(wsId, collectionId);
    final payload = <String, dynamic>{
      'title': title,
      'slug': slug,
      'collection_type': collectionType,
      'description': description,
      'is_enabled': isEnabled,
    };
    final result = await queueOrSendValue<CmsCollection>(
      feature: 'cms',
      expectedUserId: actor,
      queue: _queue,
      apiClient: _api,
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: collectionId,
      payload: payload,
      pendingValue: (id) => CmsCollection.fromJson({...payload, 'id': id}),
      send: () async =>
          CmsCollection.fromJson(await _api.patchJson(path, payload)),
    );
    await _invalidate(wsId, actor);
    return result;
  }

  Future<void> deleteCollection(String wsId, String collectionId) async {
    final actor = _actor;
    _checkActor(actor);
    final path = CmsEndpoints.collection(wsId, collectionId);
    await queueOrSendVoid(
      feature: 'cms',
      expectedUserId: actor,
      queue: _queue,
      apiClient: _api,
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: collectionId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
    await _invalidate(wsId, actor);
  }

  Future<List<CmsEntry>> listEntries(
    String wsId, {
    String? collectionId,
    bool forceRefresh = false,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final response = await readThroughJsonList(
      api: _api,
      namespace: 'cms.entries',
      workspaceId: wsId,
      path: CmsEndpoints.entries(wsId, collectionId: collectionId),
      forceRefresh: forceRefresh,
      cacheStore: _store,
      cacheUserId: () => actor,
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'cms',
      pathContains: '/external-projects/entries',
      source: response.whereType<Map<String, dynamic>>().toList(
        growable: false,
      ),
      pending: await _pendingForActor(actor),
      matchesQuery: collectionId == null
          ? null
          : (row) => row['collection_id'] == collectionId,
    );
    return rows.map(CmsEntry.fromJson).toList(growable: false);
  }

  Future<CmsEntry> createEntry(
    String wsId, {
    required String collectionId,
    required String title,
    required String slug,
    required String status,
    String? subtitle,
    String? summary,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final path = CmsEndpoints.entries(wsId);
    final payload = <String, dynamic>{
      'collection_id': collectionId,
      'title': title,
      'slug': slug,
      'status': status,
      'subtitle': subtitle,
      'summary': summary,
      'metadata': <String, dynamic>{},
      'profile_data': <String, dynamic>{},
    };
    final result = await queueOrSendValue<CmsEntry>(
      feature: 'cms',
      expectedUserId: actor,
      queue: _queue,
      apiClient: _api,
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => CmsEntry.fromJson({...payload, 'id': id}),
      send: () async => CmsEntry.fromJson(await _api.postJson(path, payload)),
    );
    await _invalidate(wsId, actor);
    return result;
  }

  Future<CmsEntry> updateEntry(
    String wsId,
    String entryId, {
    required String title,
    required String slug,
    required String status,
    String? subtitle,
    String? summary,
  }) async {
    final actor = _actor;
    _checkActor(actor);
    final path = CmsEndpoints.entry(wsId, entryId);
    final payload = <String, dynamic>{
      'title': title,
      'slug': slug,
      'status': status,
      'subtitle': subtitle,
      'summary': summary,
    };
    final result = await queueOrSendValue<CmsEntry>(
      feature: 'cms',
      expectedUserId: actor,
      queue: _queue,
      apiClient: _api,
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: entryId,
      payload: payload,
      pendingValue: (id) => CmsEntry.fromJson({...payload, 'id': id}),
      send: () async => CmsEntry.fromJson(await _api.patchJson(path, payload)),
    );
    await _invalidate(wsId, actor);
    return result;
  }

  Future<void> deleteEntry(String wsId, String entryId) async {
    final actor = _actor;
    _checkActor(actor);
    final path = CmsEndpoints.entry(wsId, entryId);
    await queueOrSendVoid(
      feature: 'cms',
      expectedUserId: actor,
      queue: _queue,
      apiClient: _api,
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: entryId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
    await _invalidate(wsId, actor);
  }

  void dispose() {
    _api.dispose();
  }
}
