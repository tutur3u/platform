part of 'inventory_products_page.dart';

extension _InventoryProductsList on _InventoryProductsPageState {
  bool get _scanAvailable => widget.scanCode != null || inventoryScanSupported;

  Widget _buildBody(BuildContext context) {
    final l10n = context.l10n;
    final paneOpen = _split && _selectedId != null;
    return AppScaffold(
      child: PopScope(
        // On split layouts the first Back closes the detail pane.
        canPop: !paneOpen,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop && paneOpen) _closeSelection();
        },
        child: Stack(
          children: [
            InventorySearchChrome(
              key: _searchKey,
              location: widget.location,
              controller: _searchController,
              onChanged: _onSearchChanged,
              hint: l10n.inventorySearchProducts,
              actions: [
                if (_scanAvailable)
                  ShellActionSpec(
                    id: '${Routes.inventoryProducts}-scan',
                    icon: LucideIcons.scanLine,
                    tooltip: l10n.inventoryScanAction,
                    onPressed: () => unawaited(_scan()),
                  ),
              ],
            ),
            AppMasterDetail(
              master: NovaRefreshIndicator(
                onRefresh: () => _loadInitial(forceRefresh: true),
                child: _buildList(context),
              ),
              detailKey: _selectedId,
              onSplitChanged: (split) {
                if (mounted && split != _split) _set(() => _split = split);
              },
              onCloseDetail: _closeSelection,
              emptyDetail: AppMasterDetailEmpty(
                icon: LucideIcons.package,
                title: l10n.inventoryDetailEmpty,
              ),
              detail: switch (_selectedId) {
                final id? => InventoryProductDetailView(
                  key: ValueKey(('inventory-detail', _wsId, id)),
                  productId: id,
                  initial: _selected,
                  inventoryRepository: _inventoryRepository,
                  permissionsRepository: _permissionsRepository,
                  openEditor: widget.openEditor,
                  onChanged: () => unawaited(_loadInitial(forceRefresh: true)),
                  onDeleted: () {
                    _closeSelection();
                    unawaited(_loadInitial());
                  },
                ),
                null => null,
              },
            ),
            if (_canManageCatalog)
              ExtendedFab(
                icon: LucideIcons.plus,
                label: l10n.inventoryCreateProduct,
                includeBottomSafeArea: false,
                onPressed: _openEditor,
              ),
          ],
        ),
      ),
    );
  }

  String? _lookupName(List<InventoryLookupItem>? rows, String? id) =>
      id == null ? null : rows?.where((row) => row.id == id).firstOrNull?.name;

  Widget _buildList(BuildContext context) {
    final l10n = context.l10n;
    final products = _visibleProducts;
    final scanQuery = _scanQuery;
    final failedEmpty =
        _error != null && _products.isEmpty && !_isLoadingInitial;
    final header = <Widget>[
      // A retained snapshot stays visible behind a limited-data warning.
      if (_error != null && !failedEmpty)
        InventoryReadWarning(
          onRetry: () => unawaited(_loadInitial(forceRefresh: true)),
        ),
      InventoryPendingDeletions(
        userId: _scope.$1,
        workspaceId: _wsId,
        names: _deletedNames,
      ),
      InventoryProductFilters(
        status: _status,
        onStatus: _selectStatus,
        sort: _sort,
        onSort: () => unawaited(_pickSort()),
        stock: _stockFilter,
        onStock: () => unawaited(_pickStock()),
        onCategory: () => unawaited(_pickLookup(warehouses: false)),
        onWarehouse: () => unawaited(_pickLookup(warehouses: true)),
        categoryLabel: _categoryId == null
            ? null
            : _lookupName(_categories, _categoryId) ??
                  l10n.inventoryFilterCategory,
        warehouseLabel: _warehouseId == null
            ? null
            : _lookupName(_warehouses, _warehouseId) ??
                  l10n.inventoryFilterWarehouse,
        showStock: _canViewStock ?? false,
      ),
      if (scanQuery != null)
        _ScanQueryLine(query: scanQuery, onClear: () => _applyQuery(null)),
      const SizedBox(height: AppSpacing.md),
    ];
    final footer = _isLoadingMore
        ? const Padding(
            padding: EdgeInsets.symmetric(vertical: AppSpacing.lg),
            child: AppLoadingIndicator(),
          )
        : _loadMoreFailed && _products.isNotEmpty
        ? _FooterAction(
            message: l10n.inventoryItemsLoadMoreFailed,
            actionLabel: l10n.commonRetry,
            onPressed: () => unawaited(_loadMore()),
          )
        : _fillExhausted && products.isNotEmpty
        ? _FooterAction(
            message: l10n.inventoryFilterNoLoadedMatch(_products.length),
            actionLabel: l10n.inventoryFilterSearchMore,
            onPressed: _searchMore,
          )
        : null;
    final Widget? placeholder = _isLoadingInitial && products.isEmpty
        ? const AppGroupedCard(
            children: [
              AppSkeletonRows(
                count: 6,
                leadingSize: InventoryProductRow.leadingSize,
              ),
            ],
          )
        : failedEmpty
        ? AppGroupedCard(
            children: [
              AppStateMessage.inline(
                icon: LucideIcons.cloudOff,
                tone: AppTone.destructive,
                title: l10n.inventoryItemsLoadFailed,
                actionLabel: l10n.commonRetry,
                onAction: () => unawaited(_loadInitial(forceRefresh: true)),
              ),
            ],
          )
        : products.isEmpty
        ? AppGroupedCard(
            children: [
              if (_clientFiltered && _hasMore && (_filling || _isLoadingMore))
                AppStateMessage.inline(
                  icon: LucideIcons.listFilter,
                  title: l10n.inventoryFilterSearching,
                )
              else if (_clientFiltered && _hasMore && _loadMoreFailed)
                AppStateMessage.inline(
                  icon: LucideIcons.cloudOff,
                  tone: AppTone.destructive,
                  title: l10n.inventoryItemsLoadMoreFailed,
                  actionLabel: l10n.commonRetry,
                  onAction: _searchMore,
                )
              else
                _emptyState(context),
            ],
          )
        : null;

    final itemCount =
        header.length +
        (placeholder == null ? products.length : 1) +
        (footer == null ? 0 : 1);
    return AppPageListView.builder(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      itemCount: itemCount,
      itemBuilder: (context, index) {
        if (index < header.length) return header[index];
        final itemIndex = index - header.length;
        if (placeholder != null) {
          return itemIndex == 0 ? placeholder : footer!;
        }
        if (itemIndex >= products.length) return footer!;
        return _itemSlice(products[itemIndex], itemIndex, products.length);
      },
    );
  }

  Widget _itemSlice(InventoryProduct product, int index, int count) {
    final manage = _canManageCatalog;
    return AppGroupedSlice(
      key: ValueKey('inventory-item:${product.id}'),
      position: AppSlicePosition.of(index, count),
      dividerInset: InventoryProductRow.dividerInset,
      child: PendingSyncFrame(
        workspaceId: _wsId ?? product.wsId,
        entityId: product.id,
        feature: 'inventory',
        child: InventoryProductRow(
          product: product,
          currency: _currency,
          stockVisible: _canViewStock,
          selected: _split && product.id == _selectedId,
          onTap: () => unawaited(_openProduct(product)),
          onLongPress: manage ? () => _showItemActions(product) : null,
        ),
      ),
    );
  }

  Widget _emptyState(BuildContext context) {
    final l10n = context.l10n;
    if (_fillExhausted) {
      return AppStateMessage.inline(
        icon: LucideIcons.listFilter,
        title: l10n.inventoryFilterNoLoadedMatch(_products.length),
        actionLabel: l10n.inventoryFilterSearchMore,
        onAction: _searchMore,
      );
    }
    if (_categoryId != null || _clientFiltered) {
      return AppStateMessage.inline(
        icon: LucideIcons.listFilter,
        title: l10n.inventoryFiltersNoMatch,
        actionLabel: l10n.inventoryFiltersClear,
        onAction: _clearFilters,
      );
    }
    if (_query.trim().isNotEmpty) {
      return AppStateMessage.inline(
        icon: LucideIcons.searchX,
        title: l10n.inventoryItemsNoMatch,
        message: l10n.inventoryItemsNoMatchMessage,
      );
    }
    if (_status == 'archived') {
      return AppStateMessage.inline(
        icon: LucideIcons.archive,
        title: l10n.inventoryItemsNoneArchived,
      );
    }
    return AppStateMessage.inline(
      icon: LucideIcons.package,
      title: l10n.inventoryItemsEmptyTitle,
      message: l10n.inventoryProductsEmpty,
      actionLabel: _canManageCatalog ? l10n.inventoryCreateProduct : null,
      onAction: _canManageCatalog ? _openEditor : null,
    );
  }
}

/// Shows the query a scan applied, because the navbar search stays closed.
class _ScanQueryLine extends StatelessWidget {
  const _ScanQueryLine({required this.query, required this.onClear});

  final String query;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Row(
        children: [
          Icon(
            LucideIcons.scanLine,
            size: 16,
            color: tokens.colorScheme.mutedForeground,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              context.l10n.inventoryScanMatches(query),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ),
          AppButton.ghost(
            size: AppButtonSize.small,
            onPressed: onClear,
            child: Text(context.l10n.commonClear),
          ),
        ],
      ),
    );
  }
}

/// List footer with a note and one action: retry a failed page (scrolling
/// never retries on its own) or keep searching for filter matches.
class _FooterAction extends StatelessWidget {
  const _FooterAction({
    required this.message,
    required this.actionLabel,
    required this.onPressed,
  });

  final String message;
  final String actionLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
      child: Row(
        children: [
          Expanded(
            child: Text(
              message,
              style: tokens.typography.small.copyWith(
                color: tokens.colorScheme.mutedForeground,
              ),
            ),
          ),
          AppButton.ghost(
            size: AppButtonSize.small,
            onPressed: onPressed,
            child: Text(actionLabel),
          ),
        ],
      ),
    );
  }
}
