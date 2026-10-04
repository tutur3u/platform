part of 'inventory_sales_page.dart';

extension _InventorySalesPeriodActions on _InventorySalesPageState {
  Future<void> _createSalesPeriod() async {
    final wsId = _wsId;
    if (wsId == null) return;
    final period = await showCreateInventorySalesPeriod(
      context: context,
      repository: _inventoryRepository,
      wsId: wsId,
    );
    if (period == null || !mounted) return;
    _update(() {
      _selectedPeriodId = period.id;
      _salesPeriods = [
        period,
        ..._salesPeriods.where((item) => item.id != period.id),
      ];
      _sales = const [];
    });
    await _loadInitial(forceRefresh: true);
  }

  Future<void> _togglePeriodArchive(InventorySalesPeriod period) async {
    final wsId = _wsId;
    if (wsId == null) return;
    try {
      final updated = await _inventoryRepository.updateSalesPeriod(
        wsId: wsId,
        periodId: period.id,
        previous: period,
        status: period.isArchived ? 'active' : 'archived',
      );
      if (!mounted) return;
      _update(() {
        _salesPeriods = _salesPeriods
            .map((item) => item.id == updated.id ? updated : item)
            .toList(growable: false);
      });
      showInventoryToast(
        context,
        period.isArchived
            ? context.l10n.inventorySalesPeriodRestored
            : context.l10n.inventorySalesPeriodArchived,
      );
      await _loadInitial(forceRefresh: true);
    } on Exception catch (error) {
      if (mounted) {
        showInventoryToast(context, error.toString(), destructive: true);
      }
    }
  }

  Future<void> _editSalesPeriod(InventorySalesPeriod period) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final updated = await showInventorySalesPeriodEditor(
      context: context,
      repository: _inventoryRepository,
      wsId: wsId,
      period: period,
    );
    if (updated == null || !mounted) return;
    showInventoryToast(context, context.l10n.inventorySalesPeriodUpdated);
    _update(() {
      _salesPeriods = _salesPeriods
          .map((item) => item.id == updated.id ? updated : item)
          .toList(growable: false);
    });
    await _loadInitial(forceRefresh: true);
  }
}
