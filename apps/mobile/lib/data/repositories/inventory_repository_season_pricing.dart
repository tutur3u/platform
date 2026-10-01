part of 'inventory_repository.dart';

extension InventorySeasonPricingRepository on InventoryRepository {
  Future<String> _createLegacySale({
    required String wsId,
    required String walletId,
    required List<Map<String, dynamic>> products,
    String? content,
    String? notes,
    String? categoryId,
    String? periodId,
  }) async {
    final path = InventoryEndpoints.invoices(wsId);
    final payload = {
      'customer_id': null,
      'content': content ?? 'Mobile inventory sale',
      'notes': notes,
      'wallet_id': walletId,
      'category_id': categoryId,
      'products': products,
    };
    final invoiceId = await queueOrSendValue<String>(
      feature: 'inventory',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      pendingValue: (id) => id,
      send: () async {
        final response = await _api.postJson(path, payload);
        return response['invoice_id'] as String;
      },
    );
    if (periodId != null && periodId.isNotEmpty) {
      await setSalePeriod(
        wsId: wsId,
        saleId: invoiceId,
        source: 'finance_invoice',
        periodId: periodId,
      );
    }
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:sales',
      'inventory:audit',
    ]);
    return invoiceId;
  }

  Future<List<InventorySalesPeriod>> _getCheckoutSalesPeriods(
    String wsId,
  ) async {
    final response = await _api.getJson(InventoryEndpoints.salesPeriods(wsId));
    final data = response['data'];
    if (data is! List) throw const FormatException('Missing sales periods');
    return data
        .map(
          (row) => InventorySalesPeriod.fromJson(
            Map<String, dynamic>.from(row as Map),
          ),
        )
        .toList(growable: false);
  }

  Future<InventorySeasonQuote> _getSeasonQuote(
    String wsId,
    String periodId,
  ) async => InventorySeasonQuote.fromJson(
    await _api.getJson(InventoryEndpoints.seasonPrices(wsId, periodId)),
  );

  Future<String> _sendScheduledSale(
    String wsId,
    Map<String, dynamic> payload,
  ) async {
    // Direct authenticated POST: scheduled requests NEVER enter offline replay.
    final response = await _api.postJson(
      InventoryEndpoints.invoices(wsId),
      payload,
    );
    final id = response['invoice_id'];
    if (id is! String || id.isEmpty) {
      throw const FormatException('Missing invoice ID');
    }
    await _invalidateInventory(wsId, const [
      'inventory:overview',
      'inventory:sales',
      'inventory:audit',
      'inventory:periods',
    ]);
    return id;
  }
}
