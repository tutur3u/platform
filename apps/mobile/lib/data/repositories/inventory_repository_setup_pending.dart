part of 'inventory_repository.dart';

Future<List<T>> _setupRows<T>(Future<List<T>> request) async {
  try {
    return await request;
  } on Object catch (error) {
    if (!isOfflineTransportFailure(error)) rethrow;
    return <T>[];
  }
}

class InventorySetupAwaitingSync implements Exception {}

enum InventorySetupKind { owner, manufacturer, category, unit, warehouse }

extension InventorySetupOfflineWrites on InventoryRepository {
  String _setupPath(String wsId, InventorySetupKind kind) => switch (kind) {
    InventorySetupKind.owner => InventoryEndpoints.owners(wsId),
    InventorySetupKind.manufacturer => InventoryEndpoints.manufacturers(wsId),
    InventorySetupKind.category => InventoryEndpoints.productCategories(wsId),
    InventorySetupKind.unit => InventoryEndpoints.productUnits(wsId),
    InventorySetupKind.warehouse => InventoryEndpoints.productWarehouses(wsId),
  };

  Future<void> _requireConfirmedSetupItem(
    String wsId,
    String path,
    String id,
  ) async {
    final pending = await _mutationQueue.listPending();
    if (pending.any(
      (item) =>
          item.feature == 'inventory' &&
          item.workspaceId == wsId &&
          item.path == path &&
          item.method == 'POST' &&
          item.entityId == id,
    )) {
      throw InventorySetupAwaitingSync();
    }
  }

  Future<Map<String, dynamic>> _confirmedProductPayload(
    String wsId,
    Map<String, dynamic> payload,
  ) async {
    final owner = _cacheUserId();
    final pending = await _mutationQueue.listPending();
    final mappings = owner == null
        ? <String, String>{}
        : await _cacheStore.localIdMappings(
            userId: owner,
            workspaceId: wsId,
            feature: 'inventory',
          );
    if (owner != null) _api.checkUser(owner);
    String resolve(String path, String id) {
      final mapped = mappings[id];
      if (mapped != null && mapped != id) return mapped;
      if (pending.any(
        (item) =>
            item.feature == 'inventory' &&
            item.workspaceId == wsId &&
            (owner == null || item.userId == owner) &&
            item.path == path &&
            item.method == 'POST' &&
            item.entityId == id,
      )) {
        throw InventorySetupAwaitingSync();
      }
      return id;
    }

    return {
      ...payload,
      'category_id': resolve(
        InventoryEndpoints.productCategories(wsId),
        payload['category_id'] as String,
      ),
      'inventory': [
        for (final row in payload['inventory'] as List<Map<String, Object?>>)
          {
            ...row,
            'warehouse_id': resolve(
              InventoryEndpoints.productWarehouses(wsId),
              row['warehouse_id']! as String,
            ),
          },
      ],
    };
  }

  Future<void> updateSetupItem({
    required String wsId,
    required InventorySetupKind kind,
    required String id,
    required String name,
  }) async {
    await _requireConfirmedSetupItem(wsId, _setupPath(wsId, kind), id);
    final path = '${_setupPath(wsId, kind)}/$id';
    final patch =
        kind == InventorySetupKind.owner ||
        kind == InventorySetupKind.manufacturer;
    final payload = {'name': name};
    await queueOrSendVoid(
      queue: _mutationQueue,
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
    await _requireConfirmedSetupItem(wsId, _setupPath(wsId, kind), id);
    final path = '${_setupPath(wsId, kind)}/$id';
    await queueOrSendVoid(
      queue: _mutationQueue,
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
