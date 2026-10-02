part of 'inventory_repository.dart';

List<InventorySalesPeriod> _overlayPendingSalesPeriods(
  String wsId,
  List<InventorySalesPeriod> confirmed, {
  required bool includeArchived,
}) {
  final rows = {for (final period in confirmed) period.id: period};
  final createPath = InventoryEndpoints.salesPeriods(wsId);
  for (final edit in OfflineMutationQueue.instance.pending.value) {
    if (edit.feature != 'inventory' || edit.workspaceId != wsId) continue;
    final id = edit.entityId;
    final payload = edit.payload;
    if (id == null || payload == null) continue;
    if (edit.method == 'POST' && edit.path == createPath) {
      rows[id] = InventorySalesPeriod(
        id: id,
        name: payload['name'] as String? ?? '',
        description: payload['description'] as String?,
        startsAt: DateTime.tryParse(payload['starts_at'] as String? ?? ''),
        endsAt: DateTime.tryParse(payload['ends_at'] as String? ?? ''),
        status: 'active',
        saleCount: 0,
        productScope: payload['product_scope'] as String? ?? 'all',
        productIds: (payload['product_ids'] as List<dynamic>? ?? const [])
            .whereType<String>()
            .toList(growable: false),
      );
    } else if (edit.method == 'PATCH' &&
        edit.path == InventoryEndpoints.salesPeriod(wsId, id)) {
      final previous = rows[id];
      if (previous == null) continue;
      rows[id] = InventorySalesPeriod(
        id: id,
        name: payload['name'] as String? ?? previous.name,
        description: payload.containsKey('description')
            ? payload['description'] as String?
            : previous.description,
        startsAt: payload.containsKey('starts_at')
            ? DateTime.tryParse(payload['starts_at'] as String? ?? '')
            : previous.startsAt,
        endsAt: payload.containsKey('ends_at')
            ? DateTime.tryParse(payload['ends_at'] as String? ?? '')
            : previous.endsAt,
        status: payload['status'] as String? ?? previous.status,
        saleCount: previous.saleCount,
        productScope:
            payload['product_scope'] as String? ?? previous.productScope,
        productIds:
            (payload['product_ids'] as List<dynamic>?)
                ?.whereType<String>()
                .toList(growable: false) ??
            previous.productIds,
      );
    }
  }
  return rows.values
      .where((period) => includeArchived || !period.isArchived)
      .toList(growable: false);
}

extension InventorySalesPeriodMutations on InventoryRepository {
  Future<InventorySalesPeriod> createSalesPeriod({
    required String wsId,
    required String name,
    String? description,
    DateTime? startsAt,
    DateTime? endsAt,
    String productScope = 'all',
    List<String> productIds = const [],
  }) async {
    final path = InventoryEndpoints.salesPeriods(wsId);
    final payload = {
      'name': name,
      'description': description,
      'starts_at': _dateOnly(startsAt),
      'ends_at': _dateOnly(endsAt),
      'product_scope': productScope,
      'product_ids': productScope == 'all' ? <String>[] : productIds,
    };
    final period = await queueOrSendValue<InventorySalesPeriod>(
      queue: _mutationQueue,
      feature: 'inventory',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => InventorySalesPeriod(
        id: id,
        name: name,
        description: description,
        startsAt: startsAt,
        endsAt: endsAt,
        status: 'active',
        saleCount: 0,
        productScope: productScope,
        productIds: productIds,
      ),
      send: () async {
        final response = await _api.postJson(path, payload);
        return InventorySalesPeriod.fromJson(
          Map<String, dynamic>.from(response['data'] as Map),
        );
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:periods',
      'inventory:sales',
    ]);
    return period;
  }

  Future<InventorySalesPeriod> updateSalesPeriod({
    required String wsId,
    required String periodId,
    String? name,
    String? description,
    DateTime? startsAt,
    DateTime? endsAt,
    String? productScope,
    List<String>? productIds,
    String? status,
    InventorySalesPeriod? previous,
  }) async {
    final isContentUpdate = name != null;
    final path = InventoryEndpoints.salesPeriod(wsId, periodId);
    final payload = {
      if (name != null) 'name': name,
      if (isContentUpdate) 'description': description,
      if (isContentUpdate) 'starts_at': _dateOnly(startsAt),
      if (isContentUpdate) 'ends_at': _dateOnly(endsAt),
      if (productScope != null) 'product_scope': productScope,
      if (productIds != null) 'product_ids': productIds,
      if (status != null) 'status': status,
    };
    final period = await queueOrSendValue<InventorySalesPeriod>(
      queue: _mutationQueue,
      feature: 'inventory',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: periodId,
      payload: payload,
      pendingValue: (_) => InventorySalesPeriod(
        id: periodId,
        name: name ?? previous?.name ?? '',
        description: isContentUpdate ? description : previous?.description,
        startsAt: isContentUpdate ? startsAt : previous?.startsAt,
        endsAt: isContentUpdate ? endsAt : previous?.endsAt,
        status: status ?? previous?.status ?? 'active',
        saleCount: previous?.saleCount ?? 0,
        productScope: productScope ?? previous?.productScope ?? 'all',
        productIds: productIds ?? previous?.productIds ?? const [],
      ),
      send: () async {
        final response = await _api.patchJson(path, payload);
        return InventorySalesPeriod.fromJson(
          Map<String, dynamic>.from(response['data'] as Map),
        );
      },
    );
    await _invalidateInventory(wsId, const [
      'inventory:periods',
      'inventory:sales',
    ]);
    return period;
  }
}

String? _dateOnly(DateTime? value) {
  if (value == null) return null;
  final month = value.month.toString().padLeft(2, '0');
  final day = value.day.toString().padLeft(2, '0');
  return '${value.year}-$month-$day';
}
