part of 'inventory_repository.dart';

extension InventorySeasonPricingRepository on InventoryRepository {
  Future<InventoryCheckoutDefaults> _getCheckoutDefaults(String wsId) =>
      _cachedInventoryMap(
        namespace: 'checkout-defaults',
        wsId: wsId,
        tags: const ['inventory:setup', 'inventory:periods'],
        fetch: () => _api.getJson(
          '/api/v1/workspaces/$wsId/inventory/product-form-options',
        ),
        decode: InventoryCheckoutDefaults.fromJson,
      );
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
      if (periodId != null && periodId.isNotEmpty) ...{
        'price_mode': 'custom',
        'inventory_period_id': periodId,
        'inventory_request_id': newLocalMutationId(),
      },
    };
    final invoiceId = await queueOrSendValue<String>(
      queue: _mutationQueue,
      feature: 'inventory',
      method: 'POST',
      path: path,
      workspaceId: wsId,
      payload: payload,
      replaySafe: periodId != null && periodId.isNotEmpty,
      pendingValue: (id) => id,
      send: () async {
        final response = await _api.postJson(path, payload);
        return response['invoice_id'] as String;
      },
    );
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
    return await getSalesPeriods(wsId, includeArchived: false);
  }

  Future<InventorySeasonQuote> _getSeasonQuote(
    String wsId,
    String periodId,
  ) async {
    final key = _inventoryCacheKey(
      'season-quote',
      wsId,
      params: {'periodId': periodId},
    );
    InventorySeasonQuote decode(Object? json) =>
        InventorySeasonQuote.fromJson(Map<String, dynamic>.from(json! as Map));
    if (!await _networkAvailable()) {
      final snapshot = await _cacheStore.read<InventorySeasonQuote>(
        key: key,
        decode: decode,
      );
      final quote = snapshot.data;
      if (quote == null) {
        throw const ApiException(
          message: 'No saved season prices',
          statusCode: 0,
        );
      }
      return InventorySeasonQuote(
        asOf: quote.asOf,
        prices: quote.prices,
        isCached: true,
      );
    }
    try {
      final response = await _cacheStore.prefetch<InventorySeasonQuote>(
        key: key,
        policy: const CachePolicy(
          staleAfter: Duration(seconds: 15),
          expireAfter: Duration(days: 365),
          allowBackgroundRefresh: false,
        ),
        decode: decode,
        forceRefresh: true,
        tags: const ['module:inventory', 'inventory:periods'],
        fetch: () async {
          try {
            return await _api.getJson(
              InventoryEndpoints.seasonPrices(wsId, periodId),
            );
          } on ApiException catch (error) {
            if (error.statusCode == 401 ||
                (error.statusCode == 403 && !error.isVerificationRequired)) {
              await _cacheStore.remove(key);
            }
            rethrow;
          }
        },
      );
      return response.data!;
    } on Object catch (error) {
      if (!isOfflineTransportFailure(error)) rethrow;
      final snapshot = await _cacheStore.read<InventorySeasonQuote>(
        key: key,
        decode: decode,
      );
      final quote = snapshot.data;
      if (quote == null) rethrow;
      return InventorySeasonQuote(
        asOf: quote.asOf,
        prices: quote.prices,
        isCached: true,
      );
    }
  }

  /// Store a scheduled draft. The server validates exact price IDs on replay.
  Future<String> queueScheduledSale(
    String wsId,
    Map<String, dynamic> payload,
  ) async {
    final requestId = payload['inventory_request_id'] as String;
    await _mutationQueue.enqueue(
      PendingMutationRecord(
        id: requestId,
        feature: 'inventory',
        method: 'POST',
        path: InventoryEndpoints.invoices(wsId),
        createdAt: DateTime.now().toUtc(),
        userId: _cacheUserId(),
        workspaceId: wsId,
        payload: payload,
        optimisticPatch: {'entityId': requestId},
        replaySafe: true,
      ),
    );
    return requestId;
  }

  Future<String?> _getSaleReceipt(String wsId, String requestId) async {
    final response = await _api.getJson(
      InventoryEndpoints.saleReceipt(wsId, requestId),
    );
    if (response['request_id'] != requestId) {
      throw const FormatException('Mismatched receipt');
    }
    if (response['state'] == 'not_observed') return null;
    final invoiceId = response['invoice_id'];
    if (response['state'] != 'committed' ||
        invoiceId is! String ||
        invoiceId.isEmpty) {
      throw const FormatException('Invalid receipt');
    }
    return invoiceId;
  }

  Future<String> _sendScheduledSale(
    String wsId,
    Map<String, dynamic> payload,
  ) async {
    // Online journal operations send directly; offline drafts use the outbox.
    final response = await _api.postJson(
      InventoryEndpoints.invoices(wsId),
      payload,
    );
    final id = response['invoice_id'];
    if (id is! String || id.isEmpty) {
      throw const FormatException('Missing invoice ID');
    }
    await _invalidateScheduledReads(wsId);
    return id;
  }

  Future<void> _invalidateScheduledReads(String wsId) async {
    try {
      await _invalidateInventory(wsId, const [
        'inventory:overview',
        'inventory:sales',
        'inventory:audit',
        'inventory:periods',
      ]);
    } on Object {
      // A local maintenance failure cannot hide the confirmed invoice receipt.
    }
  }
}
