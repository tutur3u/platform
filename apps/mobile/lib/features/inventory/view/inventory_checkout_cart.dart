part of 'inventory_checkout_page.dart';

extension _InventoryCheckoutCart on _InventoryCheckoutPageState {
  List<Widget> _cartContent(BuildContext context) {
    final l10n = context.l10n;
    return [
      if (!_season.hasPending && !_blockedHistory) ...[
        if (!_cartMatchesPeriod) Text(l10n.inventoryCheckoutPeriodRulesChanged),
        TextButton.icon(
          onPressed: _saving || _reviewingCart ? null : _reviewCart,
          icon: const Icon(Icons.sync_rounded),
          label: Text(l10n.inventoryCheckoutReconcileCart),
        ),
        Text(l10n.inventoryCheckoutReconcileCartHelp),
        const shad.Gap(12),
      ],
      FinancePanel(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            FinanceSectionHeader(
              title: l10n.inventoryCheckoutCheckoutDetailsTitle,
            ),
            const shad.Gap(12),
            DropdownButtonFormField<String>(
              isExpanded: true,
              key: ValueKey('wallet:$_walletId'),
              initialValue: _walletId,
              items: [
                if (_walletId != null &&
                    !_wallets.any((item) => item.id == _walletId))
                  DropdownMenuItem<String>(
                    value: _walletId,
                    child: Text(widget.sale?.walletName ?? _walletId!),
                  ),
                ..._wallets.map(
                  (wallet) => DropdownMenuItem<String>(
                    value: wallet.id,
                    child: Text(wallet.name ?? ''),
                  ),
                ),
              ],
              onChanged: _saving || _reviewingCart || _season.hasPending
                  ? null
                  : (value) {
                      _update(() {
                        _walletSelectionExplicit = true;
                        _walletId = value;
                      });
                      _syncSeason();
                    },
              decoration: InputDecoration(
                labelText: l10n.inventoryCheckoutWallet,
              ),
            ),
            const shad.Gap(12),
            DropdownButtonFormField<String>(
              isExpanded: true,
              key: ValueKey('period:$_periodId'),
              initialValue: _selectedPeriod?.id ?? '',
              items: [
                DropdownMenuItem<String>(
                  value: '',
                  child: Text(l10n.inventorySalesPeriodUnassigned),
                ),
                ..._salesPeriods.map(
                  (period) => DropdownMenuItem<String>(
                    value: period.id,
                    child: Text(period.name),
                  ),
                ),
              ],
              onChanged: _saving || _reviewingCart || _season.hasPending
                  ? null
                  : (value) {
                      _update(() {
                        _periodSelectionExplicit = true;
                        _periodId = value == null || value.isEmpty
                            ? null
                            : value;
                      });
                      _syncSeason();
                    },
              decoration: InputDecoration(
                labelText: l10n.inventorySalesPeriodAssignmentLabel,
                helperText: l10n.inventorySalesPeriodAssignmentHelp,
              ),
            ),
            const shad.Gap(12),
            TextField(
              controller: _titleController,
              enabled: !_saving && !_season.hasPending,
              decoration: InputDecoration(labelText: l10n.inventorySalesTitle),
            ),
            const shad.Gap(12),
            TextField(
              controller: _noteController,
              enabled: !_saving && !_season.hasPending,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(labelText: l10n.inventorySalesNote),
            ),
            const shad.Gap(12),
            if (_requiresManualCategory)
              DropdownButtonFormField<String>(
                isExpanded: true,
                key: ValueKey('category:$_manualCategoryId'),
                initialValue: _manualCategoryId,
                items: [
                  if (_manualCategoryId != null &&
                      !_categories.any((item) => item.id == _manualCategoryId))
                    DropdownMenuItem<String>(
                      value: _manualCategoryId,
                      child: Text(
                        widget.sale?.categoryName ?? _manualCategoryId!,
                      ),
                    ),
                  ..._categories.map(
                    (category) => DropdownMenuItem<String>(
                      value: category.id,
                      child: Text(category.name ?? ''),
                    ),
                  ),
                ],
                onChanged: _saving || _reviewingCart || _season.hasPending
                    ? null
                    : (value) => _update(() {
                        _categorySelectionExplicit = true;
                        _categoryOverride = true;
                        _manualCategoryId = value;
                      }),
                decoration: InputDecoration(
                  labelText: l10n.inventoryCheckoutCategoryOverride,
                  helperText: l10n.inventoryCheckoutManualCategoryRequired,
                ),
              )
            else
              _CheckoutInfoRow(
                label: l10n.inventoryCheckoutAutoCategory,
                value:
                    _categories
                        .firstWhere(
                          (item) => item.id == _resolvedCategoryId,
                          orElse: () =>
                              const TransactionCategory(id: '', name: ''),
                        )
                        .name ??
                    '',
              ),
          ],
        ),
      ),
      const shad.Gap(16),
      if (_selectedRows.isEmpty)
        FinanceEmptyState(
          icon: Icons.shopping_cart_outlined,
          title: l10n.inventoryCheckoutCartTab,
          body: l10n.inventoryCheckoutCartEmpty,
        )
      else ...[
        FinanceSectionHeader(title: l10n.inventoryCheckoutSelectedItems),
        const shad.Gap(12),
        ..._selectedRows.map(
          (row) => Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: _CheckoutCartRowCard(
              row: row,
              price: _priceFor(row),
              seasonPricing: _scheduled,
              currency: _scheduled ? _selectedCurrency : 'VND',
              quantity: _quantityFor(row),
              onRemove: () => _changeQuantity(row, 0),
              onDecrement: () => _changeQuantity(row, _quantityFor(row) - 1),
              onIncrement: () => _changeQuantity(row, _quantityFor(row) + 1),
            ),
          ),
        ),
      ],
    ];
  }
}

extension _InventoryCheckoutReview on _InventoryCheckoutPageState {
  Future<void> _reviewCart() async {
    final wsId = _wsId;
    if (wsId == null ||
        _saving ||
        _reviewingCart ||
        _season.hasPending ||
        _blockedHistory ||
        _scopeChanged) {
      return;
    }
    final actor = _actorId;
    final revision = _scopeRevision;
    _update(() => _reviewingCart = true);
    try {
      await CacheStore.awaitRevalidation(_loadData);
      if (!mounted ||
          !_matchesSaveScope(revision, actor, wsId) ||
          _season.hasPending) {
        return;
      }
      if (_scheduled) await _season.refresh();
      if (!mounted ||
          !_matchesSaveScope(revision, actor, wsId) ||
          _season.hasPending) {
        return;
      }
      if (!_periodResolved || (_scheduled && !_season.ready)) {
        showInventoryToast(
          context,
          context.l10n.inventorySeasonPriceUnavailable,
          destructive: true,
        );
        return;
      }
      final allowed = _allRows
          .where(
            (row) =>
                _periodAllowsProduct(row.product.id) &&
                (!_scheduled || _priceFor(row) != null),
          )
          .map(_rowKey)
          .toSet();
      final removed = _quantities.keys
          .where((key) => !allowed.contains(key))
          .length;
      _update(
        () => _quantities.removeWhere((key, _) => !allowed.contains(key)),
      );
      showInventoryToast(
        context,
        removed == 0
            ? context.l10n.inventoryCheckoutCartReconciled
            : context.l10n.inventoryCheckoutCartRemoved(removed),
      );
    } on Object {
      if (mounted && _matchesSaveScope(revision, actor, wsId)) {
        showInventoryToast(
          context,
          context.l10n.inventorySeasonPriceUnavailable,
          destructive: true,
        );
      }
    } finally {
      if (mounted && _matchesSaveScope(revision, actor, wsId)) {
        _update(() => _reviewingCart = false);
      }
    }
  }
}
