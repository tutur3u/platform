import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/sources/api_client.dart';

class DocumentRepository {
  DocumentRepository({ApiClient? apiClient}) : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  Future<WorkspaceDocumentsPage> listDocuments(
    String wsId, {
    String? search,
    int limit = 50,
    int offset = 0,
  }) async {
    final response = await readThroughJson(
      api: _api,
      namespace: 'documents.list',
      workspaceId: wsId,
      path: DocumentsEndpoints.documents(
        wsId,
        search: search,
        limit: limit,
        offset: offset,
      ),
    );
    final source = (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'documents',
      pathContains: '/documents',
      source: source,
      pending: await OfflineMutationQueue.instance.listPending(),
      includeCreates: offset == 0,
      matchesQuery: search == null || search.isEmpty
          ? null
          : (row) => (row['name'] as String? ?? '').toLowerCase().contains(
              search.toLowerCase(),
            ),
    );
    final pagination = Map<String, dynamic>.from(
      response['pagination'] as Map? ?? const <String, dynamic>{},
    );
    final total =
        (pagination['filteredTotal'] as int? ??
            pagination['total'] as int? ??
            0) +
        rows.length -
        source.length;
    return WorkspaceDocumentsPage.fromJson({
      ...response,
      'data': rows,
      'pagination': {...pagination, 'filteredTotal': total},
    });
  }

  Future<WorkspaceDocument> getDocument(String wsId, String documentId) async {
    final localId = currentCacheUserId();
    if (localId != null) {
      final localRows = await CacheStore.instance.queryReplica(
        namespace: 'documents.list',
        userId: localId,
        workspaceId: wsId,
        pendingFeature: 'documents',
        pendingPathContains: '/documents',
      );
      for (final row in localRows) {
        if (row.id == documentId && row.pendingStatus != null) {
          return WorkspaceDocument.fromJson(row.payload);
        }
      }
    }
    final response = await readThroughJson(
      api: _api,
      namespace: 'documents.detail',
      workspaceId: wsId,
      path: DocumentsEndpoints.document(wsId, documentId),
    );
    return WorkspaceDocument.fromJson(
      response['data'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<String> createDocument(
    String wsId, {
    required String name,
    String content = '',
    bool isPublic = false,
  }) async {
    final path = DocumentsEndpoints.documents(wsId);
    final localId = newLocalMutationId();
    final payload = <String, dynamic>{
      'name': name,
      'content': content,
      'is_public': isPublic,
    };
    if (await OfflineMutationQueue.instance.enqueueIfOffline(
      feature: 'documents',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      entityId: localId,
      payload: payload,
    )) {
      return localId;
    }
    try {
      final response = await _api.postJson(path, payload);
      await CacheStore.instance.invalidateTags({
        'module:documents',
      }, workspaceId: wsId);
      return response['id'] as String? ?? '';
    } on ApiException catch (error) {
      if (await OfflineMutationQueue.instance.enqueueAfterNetworkFailure(
        error: error,
        feature: 'documents',
        method: 'POST',
        path: path,
        workspaceId: wsId,
        payload: payload,
        entityId: localId,
        replaySafe: false,
      )) {
        return localId;
      }
      rethrow;
    }
  }

  Future<void> updateDocument(
    String wsId,
    String documentId, {
    String? name,
    String? content,
    bool? isPublic,
  }) async {
    final path = DocumentsEndpoints.document(wsId, documentId);
    final payload = <String, dynamic>{
      if (name != null) 'name': name,
      if (content != null) 'content': content,
      if (isPublic != null) 'is_public': isPublic,
    };
    await queueOrSendVoid(
      feature: 'documents',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: documentId,
      payload: payload,
      send: () async {
        await _api.patchJson(path, payload);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:documents',
    }, workspaceId: wsId);
  }

  Future<void> deleteDocument(String wsId, String documentId) async {
    final path = DocumentsEndpoints.document(wsId, documentId);
    await queueOrSendVoid(
      feature: 'documents',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: documentId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:documents',
    }, workspaceId: wsId);
  }

  void dispose() {
    _api.dispose();
  }
}
