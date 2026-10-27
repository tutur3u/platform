part of 'inventory_products_page.dart';

extension _InventoryProductsList on _InventoryProductsPageState {
  bool get _scanAvailable => widget.scanCode != null || inventoryScanSupported;

  Widget _buildBody(BuildContext context) {
    final l10n = context.l10n;
    return AppScaffold(
      child: Stack(
        children: [
          InventorySearchChrome(
            key: _searchKey,
            location: Routes.inventoryProducts,
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
          NovaRefreshIndicator(
            onRefresh: () => _loadInitial(forceRefresh: true),
            child: _buildList(context),
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
    );
  }

  Widget _buildList(BuildContext context) {
    final l10n = context.l10n;
    final products = _products;
    final scanQuery = _scanQuery;
    final header = <Widget>[
      if (_error != null)
        InventoryReadWarning(
          onRetry: () => unawaited(_loadInitial(forceRefresh: true)),
        ),
      InventoryPendingDeletions(
        userId: _scope.$1,
        workspaceId: _wsId,
        names: _deletedNames,
      ),
      AppFilterBar<String>(
        options: [
          AppFilterOption(value: 'active', label: l10n.commonActive),
          AppFilterOption(value: 'archived', label: l10n.commonArchived),
          AppFilterOption(value: 'all', label: l10n.commonAll),
        ],
        selected: _status,
        onSelected: _selectStatus,
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
        : null;
    final Widget? placeholder = _isLoadingInitial && products.isEmpty
        ? const AppGroupedCard(
            children: [
              AppSkeletonRows(
                count: 4,
                leadingSize: InventoryItemRow.leadingSize,
              ),
            ],
          )
        : products.isEmpty
        ? AppGroupedCard(children: [_emptyState(context)])
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
      dividerInset: InventoryItemRow.dividerInset,
      child: PendingSyncFrame(
        workspaceId: _wsId ?? product.wsId,
        entityId: product.id,
        feature: 'inventory',
        child: InventoryItemRow(
          product: product,
          stockVisible: _canViewStock,
          onTap: manage ? () => _openEditor(productId: product.id) : null,
          onLongPress: manage ? () => _showItemActions(product) : null,
        ),
      ),
    );
  }

  Widget _emptyState(BuildContext context) {
    final l10n = context.l10n;
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

  Future<void> _showItemActions(InventoryProduct product) async {
    final l10n = context.l10n;
    final name = product.name?.trim() ?? '';
    await showAppActionSheet<void>(
      context: context,
      title: name.isEmpty ? l10n.inventoryProductUntitled : name,
      actions: [
        AppSheetAction(
          label: l10n.commonEdit,
          icon: LucideIcons.pencil,
          onPressed: () => _openEditor(productId: product.id),
        ),
        AppSheetAction(
          label: l10n.commonDelete,
          icon: LucideIcons.trash2,
          destructive: true,
          onPressed: () => _deleteProduct(product),
        ),
      ],
    );
  }

  Future<void> _scan() async {
    final scanCode = widget.scanCode ?? showInventoryScanSheet;
    final code = await scanCode(context);
    if (!mounted || code == null) return;
    if (code == inventoryScanSearchInsteadCode) {
      _searchKey.currentState?.open();
      return;
    }
    switch (resolveInventoryScan(code)) {
      case null:
        return;
      case InventoryScanSearch(:final query):
        _applyQuery(query);
      case InventoryScanUnsupported():
        showAppToast(context, message: context.l10n.inventoryScanNotProduct);
      case InventoryScanProduct(:final productId):
        await _openScannedProduct(productId);
    }
  }

  Future<void> _openScannedProduct(String productId) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final scope = _scope;
    InventoryProduct? product;
    try {
      product = await _inventoryRepository.getProduct(wsId, productId);
    } on Exception {
      product = null;
    }
    if (!mounted || _scope != scope) return;
    if (product == null) {
      showAppToast(context, message: context.l10n.inventoryScanNotFound);
    } else if (_canManageCatalog) {
      await _openEditor(productId: product.id);
    } else {
      _applyQuery(product.name?.trim() ?? '');
    }
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
