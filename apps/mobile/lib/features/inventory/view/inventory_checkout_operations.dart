part of 'inventory_checkout_page.dart';

extension _InventoryCheckoutOperations on _InventoryCheckoutPageState {
  Future<void> _loadData() async {
    final wsId = _wsId;
    if (_saving) {
      _reloadAfterSave = true;
      return;
    }
    if (wsId == null || _season.hasPending) {
      return;
    }
    final actor = _actorId;
    final token = ++_loadGeneration;
    _loadedWorkspace = wsId;
    _loadedActor = actor;
    _update(() => _loading = true);

    var hasUnavailableOptions = false;
    var periodsAvailable = true;
    Future<T> loadOptional<T>(
      Future<T> future,
      T fallback,
      String label,
    ) async {
      try {
        return await future;
      } on Object catch (error, stackTrace) {
        if (label == 'sales periods') periodsAvailable = false;
        hasUnavailableOptions = true;
        debugPrint(
          'Inventory checkout $label load failed: $error\n$stackTrace',
        );
        return fallback;
      }
    }

    try {
      final lastCategoryId = await loadOptional(
        _settingsRepository.getLastIncomeCategory(wsId),
        null,
        'remembered category',
      );
      final results = await Future.wait<dynamic>([
        loadOptional(
          _inventoryRepository.getProductOptions(wsId),
          _products,
          'products',
        ),
        loadOptional(_financeRepository.getWallets(wsId), _wallets, 'wallets'),
        loadOptional(
          _financeRepository.getCategories(wsId),
          _categories,
          'categories',
        ),
        loadOptional(
          _inventoryRepository.getCheckoutSalesPeriods(wsId),
          const <InventorySalesPeriod>[],
          'sales periods',
        ),
      ]);
      if (!mounted ||
          token != _loadGeneration ||
          wsId != _wsId ||
          actor != _actorId) {
        return;
      }
      if (_season.hasPending) return;
      _update(() {
        _products = results[0] as List<InventoryProduct>;
        _wallets = results[1] as List<Wallet>;
        _categories = (results[2] as List<TransactionCategory>)
            .where((item) => !(item.isExpense ?? false))
            .toList(growable: false);
        _periodsAvailable = periodsAvailable;
        _salesPeriods = results[3] as List<InventorySalesPeriod>;
        _hasUnavailableOptions = hasUnavailableOptions;
        _walletId =
            widget.sale?.walletId ??
            _walletId ??
            (_wallets.isEmpty ? null : _wallets.first.id);
        final availableCategoryIds = _categories
            .map((category) => category.id)
            .whereType<String>()
            .where((id) => id.isNotEmpty)
            .toSet();
        _manualCategoryId =
            availableCategoryIds.contains(widget.sale?.categoryId)
            ? widget.sale?.categoryId
            : availableCategoryIds.contains(lastCategoryId)
            ? lastCategoryId
            : (_categories.isEmpty ? null : _categories.first.id);
        final sale = widget.sale;
        if (sale != null && _quantities.isEmpty) {
          for (final line in sale.lines) {
            if (line.productId.isEmpty) {
              continue;
            }
            final roundedQuantity = line.quantity.round();
            if (roundedQuantity <= 0) {
              continue;
            }
            final key = '${line.productId}|${line.unitId}|${line.warehouseId}';
            _quantities[key] = roundedQuantity;
          }
        }
      });
      _syncSeason();
    } finally {
      if (mounted && token == _loadGeneration) {
        _update(() => _loading = false);
      }
    }
  }

  Future<void> _submitSale() async {
    final wsId = _wsId;
    if (wsId == null || _saving || _saleCompleted) {
      return;
    }
    if (_season.hasPending) {
      await _recoverSale();
      return;
    }
    if (!_season.journalReady) {
      return;
    }
    if (_loadedWorkspace != wsId ||
        _loadedActor != _actorId ||
        _scopeChanged ||
        _blockedHistory ||
        !_periodResolved ||
        (!_season.hasPending && !_completeQuote)) {
      showInventoryToast(
        context,
        context.l10n.inventorySeasonPriceUnavailable,
        destructive: true,
      );
      return;
    }
    final actor = _actorId;
    final revision = _scopeRevision;
    if (_selectedRows.isEmpty ||
        _walletId == null ||
        _resolvedCategoryId == null) {
      showInventoryToast(context, _validationMessage(), destructive: true);
      return;
    }

    final walletId = _walletId;
    final resolvedCategoryId = _resolvedCategoryId;
    if (walletId == null || resolvedCategoryId == null) {
      return;
    }

    _update(() => _saving = true);
    try {
      final sale = widget.sale;
      if (sale != null) {
        final updated = await _inventoryRepository.updateSale(
          wsId: wsId,
          saleId: sale.id,
          notice: _titleController.text.trim().isEmpty
              ? null
              : _titleController.text.trim(),
          note: _noteController.text.trim().isEmpty
              ? null
              : _noteController.text.trim(),
          walletId: walletId,
          categoryId: resolvedCategoryId,
          products: _selectedRows
              .map(
                (row) => {
                  'product_id': row.product.id,
                  'unit_id': row.inventory.unitId,
                  'warehouse_id': row.inventory.warehouseId,
                  'quantity': _quantityFor(row),
                  'price': _priceFor(row),
                },
              )
              .toList(growable: false),
          previous: sale,
        );
        await _inventoryRepository.setSalePeriod(
          wsId: wsId,
          saleId: sale.id,
          source: sale.source,
          periodId: _periodId,
        );
        unawaited(_rememberCategory(wsId, resolvedCategoryId));
        if (!mounted || !_matchesSaveScope(revision, actor, wsId)) {
          return;
        }
        showInventoryToast(context, context.l10n.inventorySaleUpdated);
        context.pop(updated);
        return;
      }

      if (_scheduled) {
        await _season.submit(
          walletId: walletId,
          categoryId: resolvedCategoryId,
          content: _titleController.text.trim().isEmpty
              ? 'Mobile inventory sale'
              : _titleController.text.trim(),
          notes: _noteController.text.trim(),
          lineLabels: {
            for (final row in _selectedRows)
              _rowKey(row):
                  [
                        row.product.name,
                        row.inventory.unitName,
                        row.inventory.warehouseName,
                      ]
                      .whereType<String>()
                      .where((value) => value.isNotEmpty)
                      .join(' · '),
          },
          products: _selectedRows
              .map(
                (row) => <String, dynamic>{
                  'product_id': row.product.id,
                  'unit_id': row.inventory.unitId,
                  'warehouse_id': row.inventory.warehouseId,
                  'quantity': _quantityFor(row),
                },
              )
              .toList(growable: false),
        );
      } else {
        await _inventoryRepository.createSale(
          wsId: wsId,
          walletId: walletId,
          categoryId: resolvedCategoryId,
          content: _titleController.text.trim().isEmpty
              ? null
              : _titleController.text.trim(),
          notes: _noteController.text.trim().isEmpty
              ? null
              : _noteController.text.trim(),
          products: _selectedRows
              .map(
                (row) => {
                  'product_id': row.product.id,
                  'unit_id': row.inventory.unitId,
                  'warehouse_id': row.inventory.warehouseId,
                  'quantity': _quantityFor(row),
                  'price': _priceFor(row),
                  'category_id': row.product.categoryId,
                },
              )
              .toList(growable: false),
          periodId: _periodId,
        );
      }
      if (!mounted || !_matchesSaveScope(revision, actor, wsId)) {
        return;
      }
      _update(() => _saleCompleted = true);
      unawaited(_rememberCategory(wsId, resolvedCategoryId));
      if (_scheduled) unawaited(_acknowledgeReceipt());
      showInventoryToast(context, context.l10n.inventorySaleCreated);
      if (context.canPop()) context.pop(true);
    } on ApiException catch (error) {
      if (!mounted || !_matchesSaveScope(revision, actor, wsId)) {
        return;
      }
      showInventoryToast(context, error.message, destructive: true);
    } on Object catch (error) {
      if (!mounted || !_matchesSaveScope(revision, actor, wsId)) {
        return;
      }
      showInventoryToast(context, error.toString(), destructive: true);
    } finally {
      _finishSave();
    }
  }
}
