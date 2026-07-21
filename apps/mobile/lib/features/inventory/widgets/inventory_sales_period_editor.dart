import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<InventorySalesPeriod?> showCreateInventorySalesPeriod({
  required BuildContext context,
  required InventoryRepository repository,
  required String wsId,
}) => showInventorySalesPeriodEditor(
  context: context,
  repository: repository,
  wsId: wsId,
);

Future<InventorySalesPeriod?> showInventorySalesPeriodEditor({
  required BuildContext context,
  required InventoryRepository repository,
  required String wsId,
  InventorySalesPeriod? period,
}) => showAdaptiveSheet<InventorySalesPeriod>(
  context: context,
  maxDialogWidth: 460,
  builder: (_) =>
      _SalesPeriodEditor(period: period, repository: repository, wsId: wsId),
);

class _SalesPeriodEditor extends StatefulWidget {
  const _SalesPeriodEditor({
    required this.repository,
    required this.wsId,
    this.period,
  });

  final InventorySalesPeriod? period;
  final InventoryRepository repository;
  final String wsId;

  @override
  State<_SalesPeriodEditor> createState() => _SalesPeriodEditorState();
}

class _SalesPeriodEditorState extends State<_SalesPeriodEditor> {
  late final TextEditingController _nameController;
  late final TextEditingController _notesController;
  late final TextEditingController _productSearchController;
  DateTime? _startsAt;
  DateTime? _endsAt;
  bool _saving = false;
  bool _loadingProducts = false;
  String _productScope = 'all';
  List<String> _productIds = const [];
  List<InventoryProduct> _products = const [];

  bool get _isEditing => widget.period != null;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController(text: widget.period?.name ?? '');
    _notesController = TextEditingController(
      text: widget.period?.description ?? '',
    );
    _productSearchController = TextEditingController();
    _startsAt = widget.period?.startsAt;
    _endsAt = widget.period?.endsAt;
    _productScope = widget.period?.productScope ?? 'all';
    _productIds = widget.period?.productIds ?? const [];
    unawaited(_loadProducts());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _notesController.dispose();
    _productSearchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final action = _isEditing
        ? l10n.inventorySalesPeriodSave
        : l10n.inventorySalesPeriodCreate;
    return AppDialogScaffold(
      title: _isEditing
          ? l10n.inventorySalesPeriodEditTitle
          : l10n.inventorySalesPeriodCreateTitle,
      description: _isEditing
          ? l10n.inventorySalesPeriodEditDescription
          : l10n.inventorySalesPeriodCreateDescription,
      icon: Icons.calendar_month_outlined,
      maxWidth: 460,
      actions: [
        shad.OutlineButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _saving ? null : () => unawaited(_save()),
          child: _saving
              ? const SizedBox.square(
                  dimension: 16,
                  child: shad.CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(action),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: l10n.inventorySalesPeriodName,
              hintText: l10n.inventorySalesPeriodNamePlaceholder,
            ),
            maxLength: 120,
          ),
          const shad.Gap(12),
          LayoutBuilder(
            builder: (context, constraints) {
              final fields = [
                _DateField(
                  label: l10n.inventorySalesPeriodStartsAt,
                  value: _startsAt,
                  onChanged: (value) => setState(() => _startsAt = value),
                ),
                _DateField(
                  firstDate: _startsAt,
                  label: l10n.inventorySalesPeriodEndsAt,
                  value: _endsAt,
                  onChanged: (value) => setState(() => _endsAt = value),
                ),
              ];
              if (constraints.maxWidth < 360) {
                return Column(
                  children: [fields.first, const shad.Gap(10), fields.last],
                );
              }
              return Row(
                children: [
                  Expanded(child: fields.first),
                  const shad.Gap(10),
                  Expanded(child: fields.last),
                ],
              );
            },
          ),
          const shad.Gap(12),
          TextField(
            controller: _notesController,
            decoration: InputDecoration(
              labelText: l10n.inventorySalesPeriodNotes,
              hintText: l10n.inventorySalesPeriodNotesPlaceholder,
            ),
            maxLength: 500,
            maxLines: 3,
          ),
          const shad.Gap(12),
          _ProductRuleEditor(
            loading: _loadingProducts,
            onProductIdsChanged: (ids) => setState(() => _productIds = ids),
            onScopeChanged: (scope) => setState(() => _productScope = scope),
            productIds: _productIds,
            products: _products,
            scope: _productScope,
            searchController: _productSearchController,
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final name = _nameController.text.trim();
    if (name.isEmpty) {
      showInventoryToast(
        context,
        context.l10n.inventorySalesPeriodNameRequired,
        destructive: true,
      );
      return;
    }
    if (_startsAt != null && _endsAt != null && _startsAt!.isAfter(_endsAt!)) {
      showInventoryToast(
        context,
        context.l10n.inventorySalesPeriodDateInvalid,
        destructive: true,
      );
      return;
    }
    if (_productScope != 'all' && _productIds.isEmpty) {
      showInventoryToast(
        context,
        context.l10n.inventorySalesPeriodProductsRequired,
        destructive: true,
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final description = _notesController.text.trim();
      final period = _isEditing
          ? await widget.repository.updateSalesPeriod(
              wsId: widget.wsId,
              periodId: widget.period!.id,
              name: name,
              description: description.isEmpty ? null : description,
              startsAt: _startsAt,
              endsAt: _endsAt,
              productScope: _productScope,
              productIds: _productScope == 'all' ? const [] : _productIds,
            )
          : await widget.repository.createSalesPeriod(
              wsId: widget.wsId,
              name: name,
              description: description.isEmpty ? null : description,
              startsAt: _startsAt,
              endsAt: _endsAt,
              productScope: _productScope,
              productIds: _productScope == 'all' ? const [] : _productIds,
            );
      if (mounted) Navigator.of(context).pop(period);
    } on Exception catch (error) {
      if (mounted) {
        showInventoryToast(context, error.toString(), destructive: true);
        setState(() => _saving = false);
      }
    }
  }

  Future<void> _loadProducts() async {
    setState(() => _loadingProducts = true);
    try {
      final products = await widget.repository.getProductOptions(widget.wsId);
      if (mounted) setState(() => _products = products);
    } on Object catch (error, stackTrace) {
      debugPrint('Sales period product options failed: $error\n$stackTrace');
    } finally {
      if (mounted) setState(() => _loadingProducts = false);
    }
  }
}

class _ProductRuleEditor extends StatefulWidget {
  const _ProductRuleEditor({
    required this.loading,
    required this.onProductIdsChanged,
    required this.onScopeChanged,
    required this.productIds,
    required this.products,
    required this.scope,
    required this.searchController,
  });

  final bool loading;
  final ValueChanged<List<String>> onProductIdsChanged;
  final ValueChanged<String> onScopeChanged;
  final List<String> productIds;
  final List<InventoryProduct> products;
  final String scope;
  final TextEditingController searchController;

  @override
  State<_ProductRuleEditor> createState() => _ProductRuleEditorState();
}

class _ProductRuleEditorState extends State<_ProductRuleEditor> {
  @override
  void initState() {
    super.initState();
    widget.searchController.addListener(_refresh);
  }

  @override
  void didUpdateWidget(covariant _ProductRuleEditor oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.searchController != widget.searchController) {
      oldWidget.searchController.removeListener(_refresh);
      widget.searchController.addListener(_refresh);
    }
  }

  @override
  void dispose() {
    widget.searchController.removeListener(_refresh);
    super.dispose();
  }

  void _refresh() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final query = widget.searchController.text.trim().toLowerCase();
    final products = widget.products
        .where(
          (product) =>
              query.isEmpty ||
              (product.name ?? '').toLowerCase().contains(query),
        )
        .toList(growable: false);

    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: Theme.of(context).dividerColor),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.inventorySalesPeriodProductRules,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const shad.Gap(4),
            Text(
              l10n.inventorySalesPeriodProductRulesDescription,
              style: Theme.of(context).textTheme.bodySmall,
            ),
            const shad.Gap(10),
            DropdownButtonFormField<String>(
              initialValue: widget.scope,
              items: [
                DropdownMenuItem(
                  value: 'all',
                  child: Text(l10n.inventorySalesPeriodScopeAll),
                ),
                DropdownMenuItem(
                  value: 'allowlist',
                  child: Text(l10n.inventorySalesPeriodScopeAllowlist),
                ),
                DropdownMenuItem(
                  value: 'blocklist',
                  child: Text(l10n.inventorySalesPeriodScopeBlocklist),
                ),
              ],
              onChanged: (value) {
                if (value != null) widget.onScopeChanged(value);
              },
            ),
            if (widget.scope != 'all') ...[
              const shad.Gap(10),
              TextField(
                controller: widget.searchController,
                decoration: InputDecoration(
                  hintText: l10n.inventorySalesPeriodSearchProducts,
                  prefixIcon: const Icon(Icons.search_rounded, size: 18),
                ),
              ),
              const shad.Gap(8),
              SizedBox(
                height: 210,
                child: widget.loading
                    ? const Center(child: shad.CircularProgressIndicator())
                    : ListView.builder(
                        itemCount: products.length,
                        itemBuilder: (context, index) {
                          final product = products[index];
                          final selected = widget.productIds.contains(
                            product.id,
                          );
                          return CheckboxListTile(
                            dense: true,
                            value: selected,
                            title: Text(
                              product.name ?? product.id,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            onChanged: (checked) {
                              widget.onProductIdsChanged(
                                checked == true
                                    ? [...widget.productIds, product.id]
                                    : widget.productIds
                                          .where((id) => id != product.id)
                                          .toList(growable: false),
                              );
                            },
                          );
                        },
                      ),
              ),
              const shad.Gap(6),
              Text(
                l10n.inventorySalesPeriodProductsSelected(
                  widget.productIds.length,
                ),
                style: Theme.of(context).textTheme.labelSmall,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onChanged,
    this.firstDate,
  });

  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;
  final DateTime? firstDate;

  @override
  Widget build(BuildContext context) => OutlinedButton(
    onPressed: () async {
      final now = DateTime.now();
      final picked = await showDatePicker(
        context: context,
        firstDate: firstDate ?? DateTime(now.year - 5),
        lastDate: DateTime(now.year + 15),
        initialDate: value ?? firstDate ?? now,
      );
      if (picked != null) onChanged(picked);
    },
    style: OutlinedButton.styleFrom(
      alignment: Alignment.centerLeft,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelSmall),
        const SizedBox(height: 2),
        Text(
          value == null
              ? context.l10n.inventorySalesPeriodNoDate
              : DateFormat.yMMMd(
                  Localizations.localeOf(context).toLanguageTag(),
                ).format(value!),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    ),
  );
}
