import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<T?> showInventoryProductEditorPage<T>(
  BuildContext context, {
  String? productId,
}) {
  return showFinanceFullscreenModal<T>(
    context: context,
    builder: (context) => InventoryProductEditorPage(productId: productId),
  );
}

class InventoryProductEditorPage extends StatefulWidget {
  const InventoryProductEditorPage({
    super.key,
    this.productId,
    this.inventoryRepository,
    this.financeRepository,
    this.settingsRepository,
  });

  final String? productId;
  final InventoryRepository? inventoryRepository;
  final FinanceRepository? financeRepository;
  final SettingsRepository? settingsRepository;

  @override
  State<InventoryProductEditorPage> createState() =>
      _InventoryProductEditorPageState();
}

class _InventoryProductEditorPageState
    extends State<InventoryProductEditorPage> {
  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final SettingsRepository _settingsRepository;
  late final TextEditingController _nameController;
  late final TextEditingController _manufacturerController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _usageController;

  bool _loading = true;
  bool _saving = false;

  String? _categoryId;
  String? _ownerId;
  String? _financeCategoryId;

  String? _formError;
  String? _nameError;
  String? _categoryError;
  String? _ownerError;

  List<InventoryLookupItem> _categories = const [];
  List<InventoryOwner> _owners = const [];
  List<InventoryLookupItem> _units = const [];
  List<InventoryLookupItem> _warehouses = const [];
  List<TransactionCategory> _financeCategories = const [];
  List<_InventoryRowDraft> _rows = [];

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = widget.inventoryRepository ?? InventoryRepository();
    _financeRepository = widget.financeRepository ?? FinanceRepository();
    _settingsRepository = widget.settingsRepository ?? SettingsRepository();
    _nameController = TextEditingController();
    _manufacturerController = TextEditingController();
    _descriptionController = TextEditingController();
    _usageController = TextEditingController();
    unawaited(_load());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _manufacturerController.dispose();
    _descriptionController.dispose();
    _usageController.dispose();
    for (final row in _rows) {
      row.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final wsId = _wsId;
    if (wsId == null) return;

    setState(() {
      _loading = true;
      _formError = null;
    });

    try {
      final results = await Future.wait<dynamic>([
        _inventoryRepository.getProductCategories(wsId),
        _inventoryRepository.getOwners(wsId),
        _inventoryRepository.getProductUnits(wsId),
        _inventoryRepository.getProductWarehouses(wsId),
        _financeRepository.getCategories(wsId),
        if (widget.productId != null)
          _inventoryRepository.getProduct(wsId, widget.productId!)
        else
          Future<InventoryProduct?>.value(),
      ]);

      final categories = results[0] as List<InventoryLookupItem>;
      final owners = results[1] as List<InventoryOwner>;
      final units = results[2] as List<InventoryLookupItem>;
      final warehouses = results[3] as List<InventoryLookupItem>;
      final financeCategories = results[4] as List<TransactionCategory>;
      final product = results[5] as InventoryProduct?;

      if (product != null) {
        _nameController.text = product.name ?? '';
        _manufacturerController.text = product.manufacturer ?? '';
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
                amount: row.amount?.toString() ?? '0',
                minAmount: row.minAmount.toString(),
                price: row.price.toString(),
              ),
            )
            .toList(growable: false);
      } else {
        await _restoreDraftSelections(
          wsId,
          categories: categories,
          owners: owners,
          financeCategories: financeCategories,
        );
      }

      if (_rows.isEmpty) {
        _rows = [
          _InventoryRowDraft.empty(units: units, warehouses: warehouses),
        ];
      }

      if (!mounted) return;
      setState(() {
        _categories = categories;
        _owners = owners;
        _units = units;
        _warehouses = warehouses;
        _financeCategories = financeCategories;
        _loading = false;
      });
    } on Exception catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _formError = error.toString();
      });
    }
  }

  void _addRow() {
    setState(() {
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
    final results = await Future.wait<String?>([
      _settingsRepository.getLastInventoryProductOwner(wsId),
      _settingsRepository.getLastInventoryProductCategory(wsId),
      _settingsRepository.getLastInventoryProductFinanceCategory(wsId),
    ]);

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
    setState(() {
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
    setState(() {
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
    setState(() {
      _financeCategoryId = selectedId;
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

      final normalizedAmountText = amountText.isEmpty ? '0' : amountText;
      final normalizedMinAmountText = minAmountText.isEmpty
          ? '0'
          : minAmountText;
      final amount = double.tryParse(normalizedAmountText);
      final minAmount = double.tryParse(normalizedMinAmountText);
      final price = double.tryParse(priceText);

      if (amountText.isEmpty) {
        row.amountController.text = normalizedAmountText;
      }
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
        ..amountError = amount == null
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

    setState(() {
      _nameError = nextNameError;
      _categoryError = nextCategoryError;
      _ownerError = nextOwnerError;
      _formError = hasError ? l10n.inventoryProductValidationError : null;
    });

    return hasError ? null : entries;
  }

  Future<void> _save() async {
    final wsId = _wsId;
    if (wsId == null || _saving) return;

    final entries = _validateForm();
    if (entries == null) {
      return;
    }

    setState(() => _saving = true);
    try {
      final name = _nameController.text.trim();
      final manufacturer = _manufacturerController.text.trim();
      final description = _descriptionController.text.trim();
      final usage = _usageController.text.trim();

      if (widget.productId == null) {
        await _inventoryRepository.createProduct(
          wsId: wsId,
          name: name,
          categoryId: _categoryId!,
          ownerId: _ownerId!,
          inventory: entries,
          manufacturer: manufacturer.isEmpty ? null : manufacturer,
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
          manufacturer: manufacturer.isEmpty ? null : manufacturer,
          description: description.isEmpty ? null : description,
          usage: usage.isEmpty ? null : usage,
          financeCategoryId: _financeCategoryId,
        );
      }

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
      setState(() => _formError = error.message);
      showInventoryToast(context, error.message, destructive: true);
    } on Exception catch (error) {
      if (!mounted) return;
      final message = error.toString();
      setState(() => _formError = message);
      showInventoryToast(context, message, destructive: true);
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final firstPrice = _rows.isEmpty
        ? null
        : double.tryParse(_rows.first.priceController.text.trim());
    final previewName = _nameController.text.trim().isEmpty
        ? (widget.productId == null
              ? l10n.inventoryCreateProduct
              : l10n.inventoryEditProduct)
        : _nameController.text.trim();

    return FinanceFullscreenFormScaffold(
      title: widget.productId == null
          ? l10n.inventoryCreateProduct
          : l10n.inventoryEditProduct,
      primaryActionLabel: widget.productId == null
          ? l10n.inventoryCreateProduct
          : l10n.inventorySaveProduct,
      isSaving: _saving,
      onPrimaryPressed: _saving ? null : _save,
      child: _loading
          ? const Center(child: NovaLoadingIndicator())
          : ListView(
              padding: const EdgeInsets.only(bottom: 12),
              physics: const BouncingScrollPhysics(),
              children: [
                _InventoryDraftPreviewCard(
                  title: previewName,
                  subtitle: _buildPreviewSubtitle(),
                  amountLabel: firstPrice == null
                      ? formatCurrency(0, 'VND')
                      : formatCurrency(firstPrice, 'VND'),
                  ownerLabel: _selectedOwner?.name,
                  categoryLabel: _selectedCategory?.name,
                  financeCategoryLabel: _selectedFinanceCategory?.name,
                  stockRowsLabel: '${_rows.length}',
                ),
                const shad.Gap(12),
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
                            setState(() {
                              _nameError = null;
                              _formError = null;
                            });
                          } else {
                            setState(() {});
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
                      _InventoryTextInputCard(
                        label: l10n.inventoryProductManufacturer,
                        controller: _manufacturerController,
                        placeholder: l10n.inventoryProductManufacturer,
                        onChanged: (_) => setState(() {}),
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
                        onChanged: (_) => setState(() {}),
                      ),
                      const shad.Gap(12),
                      _InventoryTextAreaCard(
                        label: l10n.inventoryProductUsage,
                        controller: _usageController,
                        placeholder: l10n.inventoryProductUsage,
                        onChanged: (_) => setState(() {}),
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
                          onChanged: () => setState(() => _formError = null),
                          onDelete: _rows.length == 1
                              ? null
                              : () {
                                  setState(() {
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
    setState(() {
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
    setState(() {
      row
        ..warehouseId = selectedId
        ..warehouseError = null;
      _formError = null;
    });
  }

  String _buildPreviewSubtitle() {
    final parts = <String>[
      if (_selectedOwner?.name.trim().isNotEmpty ?? false)
        _selectedOwner!.name.trim(),
      if (_selectedCategory?.name.trim().isNotEmpty ?? false)
        _selectedCategory!.name.trim(),
    ];
    return parts.join(' • ');
  }

  InventoryLookupItem? get _selectedCategory {
    for (final item in _categories) {
      if (item.id == _categoryId) return item;
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

class _InventoryDraftPreviewCard extends StatelessWidget {
  const _InventoryDraftPreviewCard({
    required this.title,
    required this.subtitle,
    required this.amountLabel,
    required this.stockRowsLabel,
    this.ownerLabel,
    this.categoryLabel,
    this.financeCategoryLabel,
  });

  final String title;
  final String subtitle;
  final String amountLabel;
  final String stockRowsLabel;
  final String? ownerLabel;
  final String? categoryLabel;
  final String? financeCategoryLabel;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = FinancePalette.of(context).accent;
    final stockCountLabel = [
      stockRowsLabel,
      context.l10n.inventoryProductInventory,
    ].join(' ');

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: accent.withValues(alpha: 0.18)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accent.withValues(alpha: 0.18),
            FinancePalette.of(context).panel,
            FinancePalette.of(context).elevatedPanel,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  Icons.inventory_2_outlined,
                  size: 20,
                  color: accent,
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (subtitle.trim().isNotEmpty) ...[
                      const shad.Gap(4),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.xSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const shad.Gap(12),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    amountLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.large.copyWith(
                      fontWeight: FontWeight.w900,
                      color: accent,
                      height: 1.05,
                    ),
                  ),
                  const shad.Gap(2),
                  _InventoryPreviewChip(
                    icon: Icons.layers_outlined,
                    label: stockCountLabel,
                    color: theme.colorScheme.mutedForeground,
                  ),
                ],
              ),
            ],
          ),
          const shad.Gap(10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (ownerLabel?.trim().isNotEmpty ?? false)
                _InventoryPreviewChip(
                  icon: Icons.people_outline_rounded,
                  label: ownerLabel!,
                  color: theme.colorScheme.foreground,
                ),
              if (categoryLabel?.trim().isNotEmpty ?? false)
                _InventoryPreviewChip(
                  icon: Icons.category_outlined,
                  label: categoryLabel!,
                  color: accent,
                ),
              if (financeCategoryLabel?.trim().isNotEmpty ?? false)
                _InventoryPreviewChip(
                  icon: Icons.account_balance_wallet_outlined,
                  label: financeCategoryLabel!,
                  color: theme.colorScheme.mutedForeground,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _InventoryPreviewChip extends StatelessWidget {
  const _InventoryPreviewChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const shad.Gap(4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 148),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: shad.Theme.of(context).typography.xSmall.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InventoryInlineAlertCard extends StatelessWidget {
  const _InventoryInlineAlertCard({
    required this.message,
    required this.color,
    required this.icon,
  });

  final String message;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const shad.Gap(10),
          Expanded(
            child: Text(
              message,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                color: color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _InventorySectionCard extends StatelessWidget {
  const _InventorySectionCard({
    required this.title,
    required this.child,
    this.action,
  });

  final String title;
  final Widget child;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 22,
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  title,
                  style: shad.Theme.of(context).typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (action != null) ...[
                const shad.Gap(12),
                action!,
              ],
            ],
          ),
          const shad.Gap(10),
          child,
        ],
      ),
    );
  }
}

class _InventorySelectorCard extends StatelessWidget {
  const _InventorySelectorCard({
    required this.label,
    required this.placeholder,
    required this.icon,
    this.title,
    this.errorText,
    this.onTap,
  });

  final String label;
  final String placeholder;
  final IconData icon;
  final String? title;
  final String? errorText;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final hasValue = title?.trim().isNotEmpty ?? false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _InventorySurface(
          label,
          icon: icon,
          errorText: errorText,
          onTap: onTap,
          child: Row(
            children: [
              Expanded(
                child: Text(
                  hasValue ? title! : placeholder,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: hasValue ? FontWeight.w700 : FontWeight.w500,
                    color: hasValue
                        ? theme.colorScheme.foreground
                        : theme.colorScheme.mutedForeground,
                  ),
                ),
              ),
              const shad.Gap(10),
              Icon(
                Icons.expand_more_rounded,
                size: 18,
                color: palette.accent,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _InventoryTextInputCard extends StatelessWidget {
  const _InventoryTextInputCard({
    required this.label,
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.fieldKey,
    this.errorText,
    this.keyboardType,
  });

  final String label;
  final Key? fieldKey;
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final String? errorText;
  final TextInputType? keyboardType;

  @override
  Widget build(BuildContext context) {
    return _InventorySurface(
      label,
      icon: Icons.edit_note_rounded,
      errorText: errorText,
      child: shad.TextField(
        contextMenuBuilder: platformTextContextMenuBuilder(),
        key: fieldKey,
        controller: controller,
        keyboardType: keyboardType,
        placeholder: Text(placeholder),
        onChanged: onChanged,
      ),
    );
  }
}

class _InventoryTextAreaCard extends StatelessWidget {
  const _InventoryTextAreaCard({
    required this.label,
    required this.controller,
    required this.placeholder,
    required this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return _InventorySurface(
      label,
      icon: Icons.notes_rounded,
      child: shad.TextArea(
        contextMenuBuilder: platformTextContextMenuBuilder(),
        controller: controller,
        placeholder: Text(placeholder),
        initialHeight: 96,
        minHeight: 96,
        maxHeight: 156,
        onChanged: onChanged,
      ),
    );
  }
}

class _InventorySurface extends StatelessWidget {
  const _InventorySurface(
    this.label, {
    required this.child,
    this.icon = Icons.tune_rounded,
    this.errorText,
    this.onTap,
  });

  final String label;
  final Widget child;
  final IconData icon;
  final String? errorText;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final panelChild = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Icon(
              icon,
              size: 16,
              color: errorText == null
                  ? palette.accent
                  : theme.colorScheme.destructive,
            ),
            const shad.Gap(8),
            Expanded(
              child: Text(
                label,
                style: theme.typography.xSmall.copyWith(
                  color: errorText == null
                      ? theme.colorScheme.mutedForeground
                      : theme.colorScheme.destructive,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.35,
                ),
              ),
            ),
          ],
        ),
        const shad.Gap(10),
        child,
      ],
    );

    final container = Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: errorText == null
            ? theme.colorScheme.card
            : theme.colorScheme.destructive.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: errorText == null
              ? theme.colorScheme.border.withValues(alpha: 0.72)
              : theme.colorScheme.destructive.withValues(alpha: 0.42),
        ),
      ),
      child: panelChild,
    );

    final wrapped = onTap == null
        ? container
        : Material(
            color: Colors.transparent,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: onTap,
              child: container,
            ),
          );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        wrapped,
        if (errorText != null) ...[
          const shad.Gap(6),
          _InventoryFieldErrorText(message: errorText!),
        ],
      ],
    );
  }
}

class _InventoryFieldErrorText extends StatelessWidget {
  const _InventoryFieldErrorText({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Text(
      message,
      style: shad.Theme.of(context).typography.xSmall.copyWith(
        color: shad.Theme.of(context).colorScheme.destructive,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _InventoryStockRowCard extends StatelessWidget {
  const _InventoryStockRowCard({
    required this.index,
    required this.row,
    required this.units,
    required this.warehouses,
    required this.onPickUnit,
    required this.onPickWarehouse,
    required this.onChanged,
    this.onDelete,
  });

  final int index;
  final _InventoryRowDraft row;
  final List<InventoryLookupItem> units;
  final List<InventoryLookupItem> warehouses;
  final VoidCallback onPickUnit;
  final VoidCallback onPickWarehouse;
  final VoidCallback onChanged;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final selectedUnit = units
        .where((item) => item.id == row.unitId)
        .firstOrNull;
    final selectedWarehouse = warehouses
        .where((item) => item.id == row.warehouseId)
        .firstOrNull;
    final price = double.tryParse(row.priceController.text.trim());
    final amount = row.amountController.text.trim();
    final previewBits = <String>[
      if (amount.isNotEmpty) amount,
      if (selectedUnit?.name.trim().isNotEmpty ?? false) selectedUnit!.name,
      if (selectedWarehouse?.name.trim().isNotEmpty ?? false)
        selectedWarehouse!.name,
    ];

    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 20,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${context.l10n.inventoryProductInventory} ${index + 1}',
                  style: shad.Theme.of(context).typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              if (price != null)
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: Text(
                    formatCurrency(price, 'VND'),
                    style: shad.Theme.of(context).typography.small.copyWith(
                      fontWeight: FontWeight.w800,
                      color: FinancePalette.of(context).accent,
                    ),
                  ),
                ),
              if (onDelete != null)
                shad.GhostButton(
                  density: shad.ButtonDensity.compact,
                  onPressed: onDelete,
                  child: const Icon(Icons.delete_outline_rounded, size: 18),
                ),
            ],
          ),
          if (previewBits.isNotEmpty) ...[
            const shad.Gap(6),
            Text(
              previewBits.join(' • '),
              style: shad.Theme.of(context).typography.xSmall.copyWith(
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
            ),
          ],
          const shad.Gap(12),
          _InventorySelectorCard(
            label: context.l10n.inventoryProductUnit,
            title: selectedUnit?.name,
            placeholder: context.l10n.inventoryProductUnit,
            icon: Icons.straighten_rounded,
            errorText: row.unitError,
            onTap: onPickUnit,
          ),
          const shad.Gap(12),
          _InventorySelectorCard(
            label: context.l10n.inventoryProductWarehouse,
            title: selectedWarehouse?.name,
            placeholder: context.l10n.inventoryProductWarehouse,
            icon: Icons.warehouse_outlined,
            errorText: row.warehouseError,
            onTap: onPickWarehouse,
          ),
          const shad.Gap(12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _InventoryTextInputCard(
                  label: context.l10n.inventoryProductAmount,
                  controller: row.amountController,
                  placeholder: context.l10n.inventoryProductAmount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  errorText: row.amountError,
                  onChanged: (_) {
                    row.amountError = null;
                    onChanged();
                  },
                ),
              ),
              const shad.Gap(12),
              Expanded(
                child: _InventoryTextInputCard(
                  label: context.l10n.inventoryProductMinAmount,
                  controller: row.minAmountController,
                  placeholder: context.l10n.inventoryProductMinAmount,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  errorText: row.minAmountError,
                  onChanged: (_) {
                    row.minAmountError = null;
                    onChanged();
                  },
                ),
              ),
            ],
          ),
          const shad.Gap(12),
          _InventoryTextInputCard(
            label: context.l10n.inventoryProductPrice,
            fieldKey: ValueKey('inventory-stock-price-$index'),
            controller: row.priceController,
            placeholder: context.l10n.inventoryProductPrice,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            errorText: row.priceError,
            onChanged: (_) {
              row.priceError = null;
              onChanged();
            },
          ),
        ],
      ),
    );
  }
}

class _InventoryRowDraft {
  _InventoryRowDraft({
    required this.unitId,
    required this.warehouseId,
    required String amount,
    required String minAmount,
    required String price,
  }) : amountController = TextEditingController(text: amount),
       minAmountController = TextEditingController(text: minAmount),
       priceController = TextEditingController(text: price);

  factory _InventoryRowDraft.empty({
    required List<InventoryLookupItem> units,
    required List<InventoryLookupItem> warehouses,
  }) => _InventoryRowDraft(
    unitId: units.isEmpty ? null : units.first.id,
    warehouseId: warehouses.isEmpty ? null : warehouses.first.id,
    amount: '0',
    minAmount: '0',
    price: '',
  );

  String? unitId;
  String? warehouseId;
  String? unitError;
  String? warehouseError;
  String? amountError;
  String? minAmountError;
  String? priceError;

  final TextEditingController amountController;
  final TextEditingController minAmountController;
  final TextEditingController priceController;

  void clearErrors() {
    unitError = null;
    warehouseError = null;
    amountError = null;
    minAmountError = null;
    priceError = null;
  }

  void dispose() {
    amountController.dispose();
    minAmountController.dispose();
    priceController.dispose();
  }
}
