part of 'finance_repository.dart';

mixin FinanceRepositoryTaxonomy {
  ApiClient get _api;

  // ── Categories ──────────────────────────────────

  Future<List<TransactionCategory>> getCategories(String wsId) async {
    final path = FinanceEndpoints.categories(wsId);
    final response = await readThroughJsonList(
      api: _api,
      namespace: 'finance.categories',
      workspaceId: wsId,
      path: path,
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'finance',
      pathContains: path,
      source: response.whereType<Map<String, dynamic>>().toList(),
      pending: await OfflineMutationQueue.instance.listPending(),
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
    final response = await readThroughJsonList(
      api: _api,
      namespace: 'finance.tags',
      workspaceId: wsId,
      path: path,
    );
    final rows = overlayPendingCollection(
      workspaceId: wsId,
      feature: 'finance',
      pathContains: path,
      source: response.whereType<Map<String, dynamic>>().toList(),
      pending: await OfflineMutationQueue.instance.listPending(),
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
