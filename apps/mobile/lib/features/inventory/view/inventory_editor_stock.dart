part of 'inventory_product_editor_page.dart';

extension _InventoryEditorStock on _InventoryProductEditorPageState {
  /// Stock rows show for Adjust stock, and when creating as an actor who
  /// may set stock. Editing never sends stock, so a stale form cannot
  /// overwrite sales and actors without stock access can still edit.
  bool get _showStock =>
      widget.stockFirst || (widget.productId == null && _canAdjustStock);

  Future<void> _resolveAdjustPermission() async {
    final wsId = _wsId;
    if (wsId == null) return;
    try {
      final repository =
          widget.permissionsRepository ?? WorkspacePermissionsRepository();
      final cached = repository.peekPermissions(wsId);
      if (cached != null) {
        _update(() => _canAdjustStock = canAdjustInventoryStock(cached));
      }
      final fresh = await repository.getPermissions(wsId: wsId);
      if (mounted && _wsId == wsId) {
        _update(() => _canAdjustStock = canAdjustInventoryStock(fresh));
      }
    } on Object {
      // Without a verified grant the form leaves stock out.
    }
  }

  /// Saves Adjust stock through the history-recording stock endpoint. It
  /// needs a connection, and refuses when the server's rows no longer match
  /// the rows this form started from; the form then shows the latest rows.
  Future<void> _saveStock(
    String wsId,
    (String?, String?) scope,
    List<InventoryStockEntry> entries,
  ) async {
    final productId = widget.productId;
    if (productId == null) return;
    final l10n = context.l10n;
    _update(() => _saving = true);
    try {
      await _inventoryRepository.adjustProductStock(
        wsId: wsId,
        productId: productId,
        baseline: _baseline,
        inventory: entries,
      );
      if (!mounted || _scope != scope) return;
      showInventoryToast(context, l10n.inventoryProductSaved);
      context.pop(true);
    } on InventoryStockOffline {
      if (mounted) _update(() => _formError = l10n.inventoryStockNeedsOnline);
    } on InventoryStockConflict catch (conflict) {
      if (!mounted || _scope != scope) return;
      _update(() {
        _replaceRows(conflict.latest.inventory);
        _formError = l10n.inventoryStockChanged;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      _update(() => _formError = error.message);
      showInventoryToast(context, error.message, destructive: true);
    } finally {
      if (mounted) _update(() => _saving = false);
    }
  }

  void _replaceRows(List<InventoryStockEntry> rows) {
    for (final row in _rows) {
      row.dispose();
    }
    _baseline = rows;
    _rows = rows.isEmpty
        ? [_InventoryRowDraft.empty(units: _units, warehouses: _warehouses)]
        : [
            for (final row in rows)
              _InventoryRowDraft(
                unitId: row.unitId,
                warehouseId: row.warehouseId,
                amount: row.amount?.toString() ?? '',
                minAmount: row.minAmount.toString(),
                price: row.price.toString(),
              ),
          ];
  }
}
