part of 'inventory_product_editor_page.dart';

extension _InventoryEditorPresentation on _InventoryProductEditorPageState {
  Widget _buildEditor(BuildContext context) {
    final l10n = context.l10n;
    return InventoryFormScaffold(
      embedded: widget.embedded,
      title: widget.productId == null
          ? l10n.inventoryCreateProduct
          : l10n.inventoryEditProduct,
      primaryActionLabel: widget.productId == null
          ? l10n.inventoryCreateProduct
          : l10n.inventorySaveProduct,
      isSaving: _saving,
      onPrimaryPressed: _saving || _refreshing ? null : _save,
      child: _loading
          ? const Center(child: NovaLoadingIndicator())
          : ListView(
              padding: const EdgeInsets.only(bottom: 12),
              physics: const BouncingScrollPhysics(),
              children: [
                if (_loadedProduct case final product?
                    when product.avatarUrl?.isNotEmpty ?? false) ...[
                  Center(
                    child: InventoryProductImage(product: product, size: 160),
                  ),
                  const shad.Gap(12),
                ],
                if (_refreshing)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8),
                    child: LinearProgressIndicator(),
                  ),
                if (_hasUnavailableOptions) ...[
                  _InventoryInlineAlertCard(
                    message: l10n.inventoryProductOptionsUnavailable,
                    color: FinancePalette.of(context).accent,
                    icon: Icons.cloud_off_outlined,
                    actionLabel: l10n.commonRetry,
                    onAction: _load,
                  ),
                  const shad.Gap(12),
                ],
                if (_formError?.trim().isNotEmpty ?? false) ...[
                  _InventoryInlineAlertCard(
                    message: _formError!,
                    color: shad.Theme.of(context).colorScheme.destructive,
                    icon: Icons.error_outline_rounded,
                  ),
                  const shad.Gap(12),
                ],
                _InventorySectionCard(
                  title: l10n.inventoryProductDetailsTitle,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _InventoryTextInputCard(
                        label: l10n.inventoryProductName,
                        fieldKey: const ValueKey('inventory-product-name'),
                        controller: _nameController,
                        placeholder: l10n.inventoryProductName,
                        errorText: _nameError,
                        onChanged: (_) {
                          if (_nameError != null || _formError != null) {
                            _update(() {
                              _nameError = null;
                              _formError = null;
                            });
                          } else {
                            _update(() {});
                          }
                        },
                      ),
                      const shad.Gap(12),
                      _InventorySelectorCard(
                        label: l10n.inventoryProductOwner,
                        title: _selectedOwner?.name,
                        placeholder: l10n.inventoryProductOwner,
                        icon: Icons.people_outline_rounded,
                        errorText: _ownerError,
                        onTap: _owners.isEmpty ? null : _pickOwner,
                      ),
                      const shad.Gap(12),
                      _InventorySelectorCard(
                        label: l10n.inventoryProductCategory,
                        title: _selectedCategory?.name,
                        placeholder: l10n.inventoryProductCategory,
                        icon: Icons.category_outlined,
                        errorText: _categoryError,
                        onTap: _categories.isEmpty ? null : _pickCategory,
                      ),
                      const shad.Gap(12),
                      _InventorySelectorCard(
                        label: l10n.inventoryProductFinanceCategory,
                        title: _selectedFinanceCategory?.name,
                        placeholder: l10n.inventoryNoLinkedFinanceCategory,
                        icon: Icons.account_balance_wallet_outlined,
                        onTap: _pickFinanceCategory,
                      ),
                      const shad.Gap(12),
                      _InventorySelectorCard(
                        label: l10n.inventoryProductManufacturer,
                        title: _selectedManufacturer?.name,
                        placeholder: l10n.inventoryNoLinkedManufacturer,
                        icon: Icons.factory_outlined,
                        onTap: _pickManufacturer,
                      ),
                    ],
                  ),
                ),
                const shad.Gap(12),
                _InventorySectionCard(
                  title: l10n.inventoryProductDescription,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _InventoryTextAreaCard(
                        label: l10n.inventoryProductDescription,
                        controller: _descriptionController,
                        placeholder: l10n.inventoryProductDescription,
                        onChanged: (_) => _update(() {}),
                      ),
                      const shad.Gap(12),
                      _InventoryTextAreaCard(
                        label: l10n.inventoryProductUsage,
                        controller: _usageController,
                        placeholder: l10n.inventoryProductUsage,
                        onChanged: (_) => _update(() {}),
                      ),
                    ],
                  ),
                ),
                const shad.Gap(12),
                _InventorySectionCard(
                  title: l10n.inventoryProductInventory,
                  action: shad.OutlineButton(
                    density: shad.ButtonDensity.compact,
                    onPressed: _addRow,
                    child: Text(l10n.inventoryProductAddInventoryRow),
                  ),
                  child: Column(
                    children: [
                      for (var index = 0; index < _rows.length; index++) ...[
                        _InventoryStockRowCard(
                          index: index,
                          row: _rows[index],
                          units: _units,
                          warehouses: _warehouses,
                          onPickUnit: () => _pickRowUnit(_rows[index]),
                          onPickWarehouse: () =>
                              _pickRowWarehouse(_rows[index]),
                          onChanged: () => _update(() => _formError = null),
                          onDelete: _rows.length == 1
                              ? null
                              : () {
                                  _update(() {
                                    _rows.removeAt(index).dispose();
                                    _formError = null;
                                  });
                                },
                        ),
                        if (index != _rows.length - 1) const shad.Gap(12),
                      ],
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  Future<void> _pickRowUnit(_InventoryRowDraft row) async {
    final selectedId = await _pickLookupOption(
      title: context.l10n.inventoryProductUnit,
      currentId: row.unitId,
      items: _units,
    );
    if (!mounted || selectedId == null) return;
    _update(() {
      row
        ..unitId = selectedId
        ..unitError = null;
      _formError = null;
    });
  }

  Future<void> _pickRowWarehouse(_InventoryRowDraft row) async {
    final selectedId = await _pickLookupOption(
      title: context.l10n.inventoryProductWarehouse,
      currentId: row.warehouseId,
      items: _warehouses,
    );
    if (!mounted || selectedId == null) return;
    _update(() {
      row
        ..warehouseId = selectedId
        ..warehouseError = null;
      _formError = null;
    });
  }

  InventoryLookupItem? get _selectedCategory {
    for (final item in _categories) {
      if (item.id == _categoryId) return item;
    }
    return null;
  }

  InventoryLookupItem? get _selectedManufacturer {
    for (final item in _manufacturers) {
      if (item.id == _manufacturerId) return item;
    }
    return null;
  }

  InventoryOwner? get _selectedOwner {
    for (final item in _owners) {
      if (item.id == _ownerId) return item;
    }
    return null;
  }

  TransactionCategory? get _selectedFinanceCategory {
    for (final item in _financeCategories) {
      if (item.id == _financeCategoryId) return item;
    }
    return null;
  }
}
