part of 'inventory_repository.dart';

Future<List<T>> _setupRows<T>(Future<List<T>> request) async {
  try {
    return await request;
  } on ApiException catch (error) {
    if (error.statusCode != 0) rethrow;
    return <T>[];
  }
}

extension InventorySetupOfflineWrites on InventoryRepository {
  Future<void> _queueInventorySetupCreate(
    String wsId,
    String path,
    String name,
  ) async {
    final payload = {'name': name};
    await queueOrSendVoid(
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
  T Function(String id, String name) pendingValue,
) {
  final rows = [...confirmed];
  for (final edit in OfflineMutationQueue.instance.pending.value) {
    if (edit.feature != 'inventory' ||
        edit.workspaceId != wsId ||
        edit.method != 'POST' ||
        edit.path != path ||
        edit.entityId == null) {
      continue;
    }
    rows.add(
      pendingValue(edit.entityId!, edit.payload?['name'] as String? ?? ''),
    );
  }
  return rows;
}
