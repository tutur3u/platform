part of 'inventory_checkout_page.dart';

extension _InventoryCheckoutPricing on _InventoryCheckoutPageState {
  InventorySalesPeriod? get _selectedPeriod {
    for (final period in _salesPeriods) {
      if (period.id == _periodId) return period;
    }
    return null;
  }

  void _syncSeason() {
    _season.configure(
      actorId: _actorId,
      workspaceId: _wsId,
      selectedPeriod: _selectedPeriod,
      currency: _selectedWallet?.currency ?? '',
    );
    if (_season.scheduled) unawaited(_season.refresh());
  }

  bool get _periodResolved =>
      _periodId == null || (_periodsAvailable && _selectedPeriod != null);
  bool get _scheduled => _selectedPeriod?.isScheduled ?? false;
  bool get _blockedHistory {
    final sale = widget.sale;
    if (sale == null) return false;
    InventorySalesPeriod? original;
    for (final period in _salesPeriods) {
      if (period.id == sale.period?.id) original = period;
    }
    return _scheduled ||
        (sale.period?.isScheduled ?? false) ||
        (sale.period != null &&
            (!_periodsAvailable || original == null || original.isScheduled));
  }

  double? _priceFor(_SellableRow row) {
    if (widget.sale == null && !_periodResolved) return null;
    if (_scheduled && widget.sale == null) {
      return _season.priceFor(_rowKey(row), row.product.id)?.price;
    }
    if (widget.sale != null) {
      for (final line in widget.sale!.lines) {
        if ('${line.productId}|${line.unitId}|${line.warehouseId}' ==
            _rowKey(row)) {
          return line.price;
        }
      }
    }
    return row.inventory.price;
  }

  bool get _completeQuote =>
      _periodResolved &&
      (!_scheduled ||
          ((_season.hasPending || _season.ready) &&
              _selectedRows.every((row) => _priceFor(row) != null)));
  String get _totalLabel => _completeQuote
      ? (_scheduled
            ? formatSeasonPrice(_cartTotal, _selectedCurrency)
            : formatCurrency(_cartTotal, _selectedCurrency))
      : '—';
}
