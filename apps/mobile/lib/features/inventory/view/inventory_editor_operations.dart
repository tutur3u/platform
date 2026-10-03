part of 'inventory_product_editor_page.dart';

extension _InventoryEditorOperations on _InventoryProductEditorPageState {
  Future<void> _load() async {
    final scope = _scope;
    final wsId = scope.$2;
    final generation = ++_loadGeneration;
    if (scope != _loadedScope) {
      _hasLoaded = false;
      _loadedProduct = null;
      _categoryId = _ownerId = _manufacturerId = _financeCategoryId = null;
      _categories = _manufacturers = _units = _warehouses = const [];
      _owners = const [];
      _financeCategories = const [];
      _nameController.clear();
      _descriptionController.clear();
      _usageController.clear();
      for (final row in _rows) {
        row.dispose();
      }
      _rows = [];
    }
    _loadedScope = scope;
    if (wsId == null || scope.$1 == null) return;
    bool current() =>
        mounted && generation == _loadGeneration && _scope == scope;

    _update(() {
      _loading = widget.productId != null && !_hasLoaded;
      _refreshing = true;
      _formError = null;
    });

    var hasUnavailableOptions = false;

    Future<T> loadOptional<T>(Future<T> future, T fallback) async {
      try {
        return await future;
      } on Object catch (error, stackTrace) {
        hasUnavailableOptions = true;
        debugPrint('Inventory product option load failed: $error\n$stackTrace');
        return fallback;
      }
    }

    try {
      final results = await Future.wait<dynamic>([
        loadOptional(
          _inventoryRepository.getProductCategories(wsId),
          _categories,
        ),
        loadOptional(
          _inventoryRepository.getManufacturers(wsId),
          _manufacturers,
        ),
        loadOptional(_inventoryRepository.getOwners(wsId), _owners),
        loadOptional(_inventoryRepository.getProductUnits(wsId), _units),
        loadOptional(
          _inventoryRepository.getProductWarehouses(wsId),
          _warehouses,
        ),
        loadOptional(
          _financeRepository.getCategories(wsId),
          _financeCategories,
        ),
        if (widget.productId != null)
          _inventoryRepository.getProduct(wsId, widget.productId!)
        else
          Future<InventoryProduct?>.value(),
      ]);

      if (!current()) return;
      final categories = results[0] as List<InventoryLookupItem>;
      final manufacturers = results[1] as List<InventoryLookupItem>;
      final owners = results[2] as List<InventoryOwner>;
      final units = results[3] as List<InventoryLookupItem>;
      final warehouses = results[4] as List<InventoryLookupItem>;
      final financeCategories = results[5] as List<TransactionCategory>;
      final product = results[6] as InventoryProduct?;
      _loadedProduct = product;

      if (!_hasLoaded && product != null) {
        _nameController.text = product.name ?? '';
        _manufacturerId = product.manufacturerId;
        _descriptionController.text = product.description ?? '';
        _usageController.text = product.usage ?? '';
        _categoryId = product.categoryId;
        _ownerId = product.ownerId;
        _financeCategoryId = product.financeCategoryId;
        _rows = product.inventory
            .map(
              (row) => _InventoryRowDraft(
                unitId: row.unitId,
                warehouseId: row.warehouseId,
                amount: row.amount?.toString() ?? '',
                minAmount: row.minAmount.toString(),
                price: row.price.toString(),
              ),
            )
            .toList(growable: false);
      } else if (!_hasLoaded && _nameController.text.isEmpty) {
        await _restoreDraftSelections(
          wsId,
          categories: categories,
          owners: owners,
          financeCategories: financeCategories,
        );
      }

      if (!current()) return;
      if (_rows.isEmpty) {
        _rows = [
          _InventoryRowDraft.empty(units: units, warehouses: warehouses),
        ];
      }

      if (!mounted) return;
      _update(() {
        _categories = categories;
        _manufacturers = manufacturers;
        _owners = owners;
        _units = units;
        _warehouses = warehouses;
        _financeCategories = financeCategories;
        _hasUnavailableOptions = hasUnavailableOptions;
        _hasLoaded = true;
        _refreshing = false;
        _loading = false;
      });
    } on ApiException catch (error) {
      if (!current()) return;
      _update(() {
        _loading = false;
        _refreshing = false;
        _formError = error.message;
      });
    } on Exception {
      if (!current()) return;
      _update(() {
        _loading = false;
        _refreshing = false;
        _formError = context.l10n.commonSomethingWentWrong;
      });
    }
  }

  void _addRow() {
    _update(() {
      _rows.add(
        _InventoryRowDraft.empty(units: _units, warehouses: _warehouses),
      );
    });
  }

  Future<void> _restoreDraftSelections(
    String wsId, {
    required List<InventoryLookupItem> categories,
    required List<InventoryOwner> owners,
    required List<TransactionCategory> financeCategories,
  }) async {
    List<String?> results;
    try {
      results = await Future.wait<String?>([
        _settingsRepository.getLastInventoryProductOwner(wsId),
        _settingsRepository.getLastInventoryProductCategory(wsId),
        _settingsRepository.getLastInventoryProductFinanceCategory(wsId),
      ]);
    } on Object catch (error, stackTrace) {
      debugPrint(
        'Inventory product remembered selections failed: $error\n$stackTrace',
      );
      return;
    }

    final rememberedOwnerId = results[0];
    final rememberedCategoryId = results[1];
    final rememberedFinanceCategoryId = results[2];

    if (rememberedOwnerId != null &&
        owners.any((item) => item.id == rememberedOwnerId)) {
      _ownerId = rememberedOwnerId;
    }

    if (rememberedCategoryId != null &&
        categories.any((item) => item.id == rememberedCategoryId)) {
      _categoryId = rememberedCategoryId;
    }

    if (rememberedFinanceCategoryId != null &&
        financeCategories.any(
          (item) => item.id == rememberedFinanceCategoryId,
        )) {
      _financeCategoryId = rememberedFinanceCategoryId;
    }
  }

  Future<void> _pickCategory() async {
    final selectedId = await _pickLookupOption(
      title: context.l10n.inventoryProductCategory,
      currentId: _categoryId,
      items: _categories,
    );
    if (!mounted || selectedId == null) return;
    _update(() {
      _categoryId = selectedId;
      _categoryError = null;
      _formError = null;
    });
  }

  Future<void> _pickOwner() async {
    final selectedId = await _pickOwnerOption(
      title: context.l10n.inventoryProductOwner,
      currentId: _ownerId,
      items: _owners,
    );
    if (!mounted || selectedId == null) return;
    _update(() {
      _ownerId = selectedId;
      _ownerError = null;
      _formError = null;
    });
  }

  Future<void> _pickFinanceCategory() async {
    final selectedId = await _pickFinanceCategoryOption(
      title: context.l10n.inventoryProductFinanceCategory,
      currentId: _financeCategoryId,
      items: _financeCategories,
    );
    if (!mounted) return;
    _update(() {
      _financeCategoryId = selectedId;
    });
  }

  Future<void> _pickManufacturer() async {
    final selectedId = await _pickManufacturerOption(
      title: context.l10n.inventoryProductManufacturer,
      currentId: _manufacturerId,
      items: _manufacturers,
    );
    if (!mounted || selectedId == null) return;

    if (selectedId == '__create__') {
      await _createManufacturerFromPicker();
      return;
    }

    _update(() {
      _manufacturerId = selectedId == '__none__' ? null : selectedId;
      _formError = null;
    });
  }

  Future<void> _createManufacturerFromPicker() async {
    final wsId = _wsId;
    if (wsId == null) return;

    final name = await _promptLookupName(
      title: context.l10n.inventoryAddManufacturer,
      confirmLabel: context.l10n.inventoryAddManufacturer,
    );
    if (!mounted || name == null || name.trim().isEmpty) return;

    await _inventoryRepository.createManufacturer(wsId, name.trim());
    final manufacturers = await _inventoryRepository.getManufacturers(
      wsId,
      forceRefresh: true,
    );
    if (!mounted) return;

    final created = manufacturers.where((item) => item.name == name.trim());
    _update(() {
      _manufacturers = manufacturers;
      _manufacturerId = created.isEmpty ? null : created.first.id;
      _formError = null;
    });
  }

  Future<String?> _pickLookupOption({
    required String title,
    required String? currentId,
    required List<InventoryLookupItem> items,
  }) {
    return showFinanceModal<String>(
      context: context,
      builder: (context) => FinanceModalScaffold(
        title: title,
        child: ListView.separated(
          itemCount: items.length,
          separatorBuilder: (_, index) => const shad.Gap(8),
          itemBuilder: (context, index) {
            final item = items[index];
            return FinancePickerTile(
              title: item.name,
              isSelected: item.id == currentId,
              onTap: () => Navigator.of(context).pop(item.id),
            );
          },
        ),
      ),
    );
  }

  Future<String?> _pickManufacturerOption({
    required String title,
    required String? currentId,
    required List<InventoryLookupItem> items,
  }) {
    return showFinanceModal<String>(
      context: context,
      builder: (context) => FinanceModalScaffold(
        title: title,
        child: ListView(
          children: [
            FinancePickerTile(
              title: context.l10n.inventoryNoLinkedManufacturer,
              isSelected: currentId == null,
              onTap: () => Navigator.of(context).pop('__none__'),
            ),
            const shad.Gap(8),
            FinancePickerTile(
              title: context.l10n.inventoryAddManufacturer,
              onTap: () => Navigator.of(context).pop('__create__'),
            ),
            const shad.Gap(8),
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: FinancePickerTile(
                  title: item.name,
                  isSelected: item.id == currentId,
                  onTap: () => Navigator.of(context).pop(item.id),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<String?> _promptLookupName({
    required String title,
    required String confirmLabel,
  }) async {
    final controller = TextEditingController();
    final result = await showFinanceModal<String>(
      context: context,
      builder: (context) => FinanceModalScaffold(
        title: title,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: controller,
              autofocus: true,
              onSubmitted: (_) =>
                  Navigator.of(context).pop(controller.text.trim()),
            ),
            const shad.Gap(16),
            shad.PrimaryButton(
              onPressed: () =>
                  Navigator.of(context).pop(controller.text.trim()),
              child: Text(confirmLabel),
            ),
          ],
        ),
      ),
    );
    controller.dispose();
    return result;
  }

  Future<String?> _pickOwnerOption({
    required String title,
    required String? currentId,
    required List<InventoryOwner> items,
  }) {
    return showFinanceModal<String>(
      context: context,
      builder: (context) => FinanceModalScaffold(
        title: title,
        child: ListView.separated(
          itemCount: items.length,
          separatorBuilder: (_, index) => const shad.Gap(8),
          itemBuilder: (context, index) {
            final item = items[index];
            return FinancePickerTile(
              title: item.name,
              isSelected: item.id == currentId,
              onTap: () => Navigator.of(context).pop(item.id),
            );
          },
        ),
      ),
    );
  }

  Future<String?> _pickFinanceCategoryOption({
    required String title,
    required String? currentId,
    required List<TransactionCategory> items,
  }) {
    return showFinanceModal<String?>(
      context: context,
      builder: (context) => FinanceModalScaffold(
        title: title,
        child: ListView(
          children: [
            FinancePickerTile(
              title: context.l10n.inventoryNoLinkedFinanceCategory,
              isSelected: currentId == null,
              onTap: () => Navigator.of(context).pop(),
            ),
            const shad.Gap(8),
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: FinancePickerTile(
                  title: item.name ?? '',
                  isSelected: item.id == currentId,
                  onTap: () => Navigator.of(context).pop(item.id),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<InventoryStockEntry>? _validateForm() {
    final l10n = context.l10n;
    final entries = <InventoryStockEntry>[];
    var hasError = false;

    final nextNameError = _nameController.text.trim().isEmpty
        ? l10n.inventoryProductNameRequired
        : null;
    final nextCategoryError = _categoryId == null
        ? l10n.inventoryProductCategoryRequired
        : null;
    final nextOwnerError = _ownerId == null
        ? l10n.inventoryProductOwnerRequired
        : null;

    if (nextNameError != null ||
        nextCategoryError != null ||
        nextOwnerError != null) {
      hasError = true;
    }

    for (final row in _rows) {
      row.clearErrors();

      final amountText = row.amountController.text.trim();
      final minAmountText = row.minAmountController.text.trim();
      final priceText = row.priceController.text.trim();

      final normalizedMinAmountText = minAmountText.isEmpty
          ? '0'
          : minAmountText;
      final amount = amountText.isEmpty ? null : double.tryParse(amountText);
      final minAmount = double.tryParse(normalizedMinAmountText);
      final price = double.tryParse(priceText);

      if (minAmountText.isEmpty) {
        row.minAmountController.text = normalizedMinAmountText;
      }

      row
        ..unitError = row.unitId == null
            ? l10n.inventoryProductUnitRequired
            : null
        ..warehouseError = row.warehouseId == null
            ? l10n.inventoryProductWarehouseRequired
            : null
        ..amountError =
            amountText.isNotEmpty &&
                (amount == null || !amount.isFinite || amount < 0)
            ? l10n.inventoryProductNumberInvalid
            : null
        ..minAmountError = minAmount == null
            ? l10n.inventoryProductNumberInvalid
            : null
        ..priceError = priceText.isEmpty
            ? l10n.inventoryProductPriceRequired
            : price == null
            ? l10n.inventoryProductNumberInvalid
            : null;

      if (row.unitError != null ||
          row.warehouseError != null ||
          row.amountError != null ||
          row.minAmountError != null ||
          row.priceError != null) {
        hasError = true;
        continue;
      }

      entries.add(
        InventoryStockEntry(
          unitId: row.unitId!,
          warehouseId: row.warehouseId!,
          amount: amount,
          minAmount: minAmount!,
          price: price!,
        ),
      );
    }

    _update(() {
      _nameError = nextNameError;
      _categoryError = nextCategoryError;
      _ownerError = nextOwnerError;
      _formError = hasError ? l10n.inventoryProductValidationError : null;
    });

    return hasError ? null : entries;
  }

  Future<void> _save() async {
    final wsId = _wsId;
    final scope = _scope;
    if (wsId == null || _saving || _refreshing || scope != _loadedScope) return;
    final entries = _validateForm();
    if (entries == null) {
      return;
    }

    _update(() => _saving = true);
    try {
      final name = _nameController.text.trim();
      final description = _descriptionController.text.trim();
      final usage = _usageController.text.trim();

      if (widget.productId == null) {
        await _inventoryRepository.createProduct(
          wsId: wsId,
          name: name,
          categoryId: _categoryId!,
          ownerId: _ownerId!,
          inventory: entries,
          manufacturerId: _manufacturerId,
          description: description.isEmpty ? null : description,
          usage: usage.isEmpty ? null : usage,
          financeCategoryId: _financeCategoryId,
        );
      } else {
        await _inventoryRepository.updateProduct(
          wsId: wsId,
          productId: widget.productId!,
          name: name,
          categoryId: _categoryId!,
          ownerId: _ownerId!,
          inventory: entries,
          manufacturerId: _manufacturerId,
          description: description.isEmpty ? null : description,
          usage: usage.isEmpty ? null : usage,
          financeCategoryId: _financeCategoryId,
        );
      }

      if (!mounted || _scope != scope) return;
      await Future.wait<void>([
        _settingsRepository.setLastInventoryProductOwner(wsId, _ownerId!),
        _settingsRepository.setLastInventoryProductCategory(wsId, _categoryId!),
        _settingsRepository.setLastInventoryProductFinanceCategory(
          wsId,
          _financeCategoryId,
        ),
      ]);
      if (!mounted) return;
      showInventoryToast(context, context.l10n.inventoryProductSaved);
      context.pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      _update(() => _formError = error.message);
      showInventoryToast(context, error.message, destructive: true);
    } on Exception catch (error) {
      if (!mounted) return;
      final message = error.toString();
      _update(() => _formError = message);
      showInventoryToast(context, message, destructive: true);
    } finally {
      if (mounted) {
        _update(() => _saving = false);
      }
    }
  }
}
