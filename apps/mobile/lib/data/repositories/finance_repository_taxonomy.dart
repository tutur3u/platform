part of 'finance_repository.dart';

Future<List<dynamic>> _financeSetupRows(Future<List<dynamic>> read) async {
  try {
    return await read;
  } on Object catch (error) {
    if (!isOfflineTransportFailure(error)) rethrow;
    return const [];
  }
}

mixin FinanceRepositoryTaxonomy {
  ApiClient get _api;
  CacheStore get _cacheStore;
  String? Function() get _cacheUserId;
  OfflineMutationQueue get _mutationQueue;

  // ── Categories ──────────────────────────────────

  Future<List<TransactionCategory>> getCategories(String wsId) async {
    final path = FinanceEndpoints.categories(wsId);
    final response = await _financeSetupRows(
      readThroughJsonList(
        api: _api,
        namespace: 'finance.categories',
        workspaceId: wsId,
        path: path,
        cacheStore: _cacheStore,
        cacheUserId: _cacheUserId,
      ),
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'finance',
      pathContains: path,
      source: response.whereType<Map<String, dynamic>>().toList(),
      pending: await _mutationQueue.listPending(),
      normalizeCreate: (payload) => {...payload, 'ws_id': wsId},
    );
    return rows.map(TransactionCategory.fromJson).toList();
  }

  Future<void> createCategory({
    required String wsId,
    required String name,
    required bool isExpense,
    String? icon,
    String? color,
  }) async {
    final path = FinanceEndpoints.categories(wsId);
    final payload = <String, dynamic>{
      'name': name,
      'is_expense': isExpense,
      'icon': icon,
      'color': color,
    };
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      send: () async {
        await _api.postJson(path, payload);
      },
    );
  }

  Future<void> updateCategory({
    required String wsId,
    required String categoryId,
    required String name,
    required bool isExpense,
    String? icon,
    String? color,
  }) async {
    final body = <String, dynamic>{
      'name': name,
      'is_expense': isExpense,
      'icon': icon,
      'color': color,
    };

    final path = FinanceEndpoints.category(wsId, categoryId);
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      payload: body,
      entityId: categoryId,
      send: () async {
        await _api.putJson(path, body);
      },
    );
  }

  Future<void> deleteCategory({
    required String wsId,
    required String categoryId,
  }) async {
    final path = FinanceEndpoints.category(wsId, categoryId);
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: categoryId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }

  // ── Tags ────────────────────────────────────────

  Future<List<FinanceTag>> getTags(String wsId) async {
    final path = FinanceEndpoints.tags(wsId);
    final response = await _financeSetupRows(
      readThroughJsonList(
        api: _api,
        namespace: 'finance.tags',
        workspaceId: wsId,
        path: path,
        cacheStore: _cacheStore,
        cacheUserId: _cacheUserId,
      ),
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'finance',
      pathContains: path,
      source: response.whereType<Map<String, dynamic>>().toList(),
      pending: await _mutationQueue.listPending(),
      normalizeCreate: (payload) => {...payload, 'ws_id': wsId},
    );
    return rows.map(FinanceTag.fromJson).toList();
  }

  Future<void> createTag({
    required String wsId,
    required String name,
    required String color,
    String? description,
  }) async {
    final path = FinanceEndpoints.tags(wsId);
    final payload = <String, dynamic>{
      'name': name,
      'color': color,
      'description': description,
    };
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      send: () async {
        await _api.postJson(path, payload);
      },
    );
  }

  Future<void> updateTag({
    required String wsId,
    required String tagId,
    required String name,
    required String color,
    String? description,
  }) async {
    final path = FinanceEndpoints.tag(wsId, tagId);
    final payload = <String, dynamic>{
      'name': name,
      'color': color,
      'description': description,
    };
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'PUT',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: tagId,
      send: () async {
        await _api.putJson(path, payload);
      },
    );
  }

  Future<void> deleteTag({required String wsId, required String tagId}) async {
    final path = FinanceEndpoints.tag(wsId, tagId);
    await queueOrSendVoid(
      queue: _mutationQueue,
      feature: 'finance',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: tagId,
      send: () async {
        await _api.deleteJson(path);
      },
    );
  }
}
