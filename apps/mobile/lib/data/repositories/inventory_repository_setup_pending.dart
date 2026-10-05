part of 'inventory_repository.dart';

Future<List<T>> _setupRows<T>(
  bool forceRefresh,
  Future<List<T>> request,
) async {
  try {
    return await request;
  } on Object catch (error) {
    if (forceRefresh ||
        CacheStore.awaitingRevalidation ||
        !isOfflineTransportFailure(error)) {
      rethrow;
    }
    return <T>[];
  }
}

enum InventorySetupKind { owner, manufacturer, category, unit, warehouse }

extension InventorySetupOfflineWrites on InventoryRepository {
  String _setupPath(String wsId, InventorySetupKind kind) => switch (kind) {
    InventorySetupKind.owner => InventoryEndpoints.owners(wsId),
    InventorySetupKind.manufacturer => InventoryEndpoints.manufacturers(wsId),
    InventorySetupKind.category => InventoryEndpoints.productCategories(wsId),
    InventorySetupKind.unit => InventoryEndpoints.productUnits(wsId),
    InventorySetupKind.warehouse => InventoryEndpoints.productWarehouses(wsId),
  };

  Future<void> updateSetupItem({
    required String wsId,
    required InventorySetupKind kind,
    required String id,
    required String name,
  }) async {
    final path = '${_setupPath(wsId, kind)}/$id';
    final patch =
        kind == InventorySetupKind.owner ||
        kind == InventorySetupKind.manufacturer;
    final payload = {'name': name};
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: patch ? 'PATCH' : 'PUT',
      path: path,
      workspaceId: wsId,
      payload: payload,
      entityId: id,
      send: () async {
        if (patch) {
          await _api.patchJson(path, payload);
        } else {
          await _api.putJson(path, payload);
        }
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:setup',
      'inventory:catalog',
    ]);
  }

  Future<void> deleteSetupItem({
    required String wsId,
    required InventorySetupKind kind,
    required String id,
  }) async {
    final path = '${_setupPath(wsId, kind)}/$id';
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: 'DELETE',
      path: path,
      workspaceId: wsId,
      entityId: id,
      send: () async {
        await _api.deleteJson(path);
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:setup',
      'inventory:catalog',
    ]);
  }

  Future<void> _queueInventorySetupCreate(
    String wsId,
    String path,
    String name,
  ) async {
    final payload = {'name': name};
    await queueOrSendVoid(
      queue: _mutationQueue,
      apiClient: _api,
      feature: 'inventory',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      send: () async {
        await _api.postJson(path, payload);
      },
    );
  }
}

List<T> _overlayPendingInventorySetup<T>(
  String wsId,
  String path,
  List<T> confirmed,
  T Function(String id, String name) pendingValue, {
  List<PendingMutationRecord>? pending,
}) {
  String idOf(T value) => switch (value) {
    InventoryOwner(:final id) => id,
    InventoryLookupItem(:final id) => id,
    _ => throw StateError('Unsupported inventory setup row'),
  };
  final rows = {for (final row in confirmed) idOf(row): row};
  for (final edit in pending ?? OfflineMutationQueue.instance.pending.value) {
    final id = edit.entityId;
    if (edit.feature != 'inventory' ||
        edit.workspaceId != wsId ||
        id == null ||
        (edit.path != path && edit.path != '$path/$id')) {
      continue;
    }
    if (edit.method == 'DELETE') {
      rows.remove(id);
      continue;
    }
    final name = edit.payload?['name'] as String?;
    if (name == null) continue;
    final previous = rows[id];
    if (previous is InventoryOwner) {
      rows[id] =
          InventoryOwner(
                id: id,
                name: name,
                avatarUrl: previous.avatarUrl,
                archived: previous.archived,
                linkedWorkspaceUserId: previous.linkedWorkspaceUserId,
                createdAt: previous.createdAt,
              )
              as T;
    } else {
      rows[id] = pendingValue(id, name);
    }
  }
  return rows.values.toList(growable: false);
}
