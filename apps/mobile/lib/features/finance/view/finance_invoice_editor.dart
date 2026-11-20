import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/data/models/finance/finance_promotion.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_promotions_repository.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/view/finance_invoice_subscription_sheet.dart';
import 'package:mobile/features/finance/view/finance_promotions_page.dart';
import 'package:mobile/features/finance/widgets/finance_directory_sheet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_workspace_sheet.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceInvoiceEditor extends StatefulWidget {
  const FinanceInvoiceEditor({
    required this.session,
    required this.repository,
    required this.wallets,
    required this.currency,
    this.pending,
    this.manualSubscription = false,
    FinancePromotionsRepository? promotionsRepository,
    super.key,
  }) : _promotionsRepository = promotionsRepository;

  final FinanceSheetSession session;
  final FinanceRepository repository;
  final List<Wallet> wallets;
  final String currency;
  final FinancePendingInvoice? pending;
  final bool manualSubscription;
  final FinancePromotionsRepository? _promotionsRepository;

  /// Promotions offered for the invoice; injected in tests.
  FinancePromotionsRepository get promotionsRepository =>
      _promotionsRepository ?? FinancePromotionsRepository();

  @override
  State<FinanceInvoiceEditor> createState() => _FinanceInvoiceEditorState();
}

class _FinanceInvoiceEditorState extends State<FinanceInvoiceEditor> {
  final _title = TextEditingController();
  final _notes = TextEditingController();
  final _lines = <FinanceInvoiceLine>[];
  late final String _wsId = widget.session.workspaceId;
  late final Future<List<TransactionCategory>> _categories = widget.repository
      .getCategories(_wsId);
  late final Future<List<FinancePromotion>> _promotions = widget
      .promotionsRepository
      .list(_wsId)
      .then(
        (promotions) => [
          for (final promotion in promotions)
            if (!promotion.usedUp) promotion,
        ],
      )
      .catchError((Object _) => <FinancePromotion>[]);
  String? _walletId;
  String? _promotionId;
  CrmUser? _customer;
  String? _categoryId;
  late String? _month = widget.pending?.months.firstOrNull;
  int _months = 1;
  bool _busy = false;
  bool _uncertain = false;
  bool _failed = false;

  @override
  void dispose() {
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _selectCustomer() async {
    final customer = await selectFinanceInvoiceCustomer(
      context,
      widget.session,
    );
    if (mounted && customer != null) setState(() => _customer = customer);
  }

  Future<void> _addLine() async {
    final inventory = InventoryRepository();
    final product = await widget.session.open<InventoryProduct>(
      context,
      (context) => FinanceDirectorySheet<InventoryProduct>(
        title: context.l10n.inventoryProductsLabel,
        empty: context.l10n.inventoryCheckoutNoSearchResults,
        fetch: (query, page) async {
          final result = await inventory.getProducts(
            _wsId,
            query: query,
            page: page,
          );
          return (items: result.data, count: result.count);
        },
        row: (context, product, _) => AppOptionTile(
          title: product.name ?? context.l10n.inventoryProductUntitled,
          onTap: () => Navigator.of(context).pop(product),
        ),
      ),
    );
    if (!mounted || product == null || !widget.session.active) return;
    final detail = await inventory
        .getProduct(_wsId, product.id)
        .catchError((Object _) => null);
    if (!mounted || !widget.session.active) return;
    final entries = detail?.inventory ?? product.inventory;
    if (entries.isEmpty) {
      showAppToast(context, message: context.l10n.financeInvoiceNoStockRows);
      return;
    }
    final entry = await widget.session.open<InventoryStockEntry>(
      context,
      (context) => AppChoiceSheet(
        title: context.l10n.inventoryProductInventoryRows,
        selected: null,
        choices: [
          for (final entry in entries)
            AppSheetChoice(
              value: entry,
              label: entry.unitName ?? context.l10n.inventoryProductUnit,
              subtitle: entry.warehouseName,
            ),
        ],
      ),
    );
    if (!mounted || entry == null || !widget.session.active) return;
    final quantity = await widget.session.open<double>(
      context,
      (_) => const _InvoiceQuantitySheet(),
      large: false,
    );
    if (!mounted || quantity == null || !widget.session.active) return;
    final line = FinanceInvoiceLine(
      productId: product.id,
      name: product.name ?? context.l10n.inventoryProductUntitled,
      unitId: entry.unitId,
      warehouseId: entry.warehouseId,
      quantity: quantity,
      price: entry.price,
    );
    setState(() {
      _lines.removeWhere((existing) => existing.key == line.key);
      _lines.add(line);
    });
  }

  Future<void> _submit() async {
    final pending = widget.pending;
    final walletId = _walletId;
    if (_busy || walletId == null) return;
    final canCreate =
        widget.session.allows('create_invoices') ||
        (pending == null && widget.session.allows('create_inventory_sales'));
    if (!canCreate) return;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      await widget.repository.createInvoice(
        workspace: _wsId,
        walletId: walletId,
        customerId: pending?.customerId ?? _customer?.id,
        categoryId: _categoryId,
        content: _title.text.trim(),
        notes: _notes.text.trim(),
        lines: List.of(_lines),
        promotionId: _promotionId,
        subscription: pending == null
            ? null
            : (groups: pending.groups, month: _month!, months: _months),
      );
      if (mounted && widget.session.active) Navigator.of(context).pop(true);
    } on Object catch (error) {
      if (!mounted || !widget.session.active) return;
      setState(() {
        _uncertain =
            error is! ApiException ||
            !{400, 401, 403, 404, 422}.contains(error.statusCode);
        _failed = true;
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final pending = widget.pending;
    final canSubmit =
        !_busy &&
        !_uncertain &&
        _walletId != null &&
        _title.text.trim().isNotEmpty &&
        _lines.isNotEmpty &&
        (pending == null || (_month != null && pending.groups.isNotEmpty));
    final currency =
        widget.wallets
            .where((wallet) => wallet.id == _walletId)
            .firstOrNull
            ?.currency ??
        widget.currency;
    return AppSheetScaffold(
      title: pending == null
          ? l10n.financeInvoiceNew
          : widget.manualSubscription
          ? l10n.financeInvoiceManualSubscription
          : l10n.financeInvoiceSubscriptionNew,
      actions: [
        AppButton.primary(
          onPressed: canSubmit ? _submit : null,
          child: Text(l10n.commonSave),
        ),
      ],
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        spacing: AppSpacing.md,
        children: [
          if (_busy) const AppLoadingIndicator(),
          if (_failed)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: _uncertain
                  ? l10n.financeInvoiceUnconfirmed
                  : l10n.commonSomethingWentWrong,
            ),
          AppTextField(
            controller: _title,
            label: l10n.financeInvoiceContent,
            placeholder: l10n.financeInvoiceContent,
            onChanged: (_) => setState(() {}),
          ),
          if (pending != null)
            AppRichRow(
              title: pending.customer,
              leading: const AppIconTile(icon: LucideIcons.user),
            )
          else
            AppButton.secondary(
              onPressed: _busy ? null : _selectCustomer,
              child: Text(_customer?.label ?? l10n.financeInvoiceCustomer),
            ),
          if (pending != null) ...[
            AppSelect<String>(
              title: l10n.financeInvoiceCoverage,
              placeholder: l10n.financeInvoiceCoverage,
              options: [
                for (final month in pending.months)
                  AppSelectOption(
                    value: month,
                    label: switch (DateTime.tryParse('$month-01')) {
                      final date? => DateFormat.yMMMM(
                        l10n.localeName,
                      ).format(date),
                      null => month,
                    },
                  ),
              ],
              value: _month,
              onChanged: (value) {
                if (mounted) setState(() => _month = value);
              },
            ),
            AppSelect<int>(
              title: l10n.financeInvoicePrepaidMonths,
              options: [
                for (var i = 1; i <= 12; i++)
                  AppSelectOption(
                    value: i,
                    label: l10n.financeInvoiceMonths(i),
                  ),
              ],
              value: _months,
              onChanged: (value) {
                if (mounted) setState(() => _months = value);
              },
            ),
          ],
          AppSelect<String>(
            title: l10n.financeWallet,
            placeholder: l10n.financeWallet,
            options: [
              for (final wallet in widget.wallets)
                AppSelectOption(
                  value: wallet.id,
                  label: wallet.name ?? wallet.id,
                ),
            ],
            value: _walletId,
            onChanged: _busy
                ? null
                : (value) {
                    if (mounted) setState(() => _walletId = value);
                  },
          ),
          FutureBuilder<List<TransactionCategory>>(
            future: _categories,
            builder: (context, snapshot) => AppSelect<String>(
              title: l10n.financeCategory,
              placeholder: l10n.financeCategory,
              options: [
                for (final category
                    in snapshot.data ?? const <TransactionCategory>[])
                  if (category.isExpense == false)
                    AppSelectOption(
                      value: category.id,
                      label: category.name ?? category.id,
                    ),
              ],
              value: _categoryId,
              onChanged: _busy
                  ? null
                  : (value) {
                      if (mounted) setState(() => _categoryId = value);
                    },
            ),
          ),
          FutureBuilder<List<FinancePromotion>>(
            future: _promotions,
            builder: (context, snapshot) {
              final promotions = snapshot.data ?? const <FinancePromotion>[];
              if (promotions.isEmpty) return const SizedBox.shrink();
              return AppSelect<String>(
                key: const ValueKey('invoice-promotion'),
                title: l10n.financePromotion,
                options: [
                  AppSelectOption(value: '', label: l10n.financePromotionNone),
                  for (final promotion in promotions)
                    AppSelectOption(
                      value: promotion.id,
                      label: promotion.name,
                      description: [
                        promotion.code,
                        promotionValueLabel(context, promotion, currency),
                      ].join(' · '),
                      icon: LucideIcons.ticketPercent,
                    ),
                ],
                value: _promotionId ?? '',
                onChanged: _busy
                    ? null
                    : (value) {
                        if (mounted) {
                          setState(
                            () => _promotionId = value.isEmpty ? null : value,
                          );
                        }
                      },
              );
            },
          ),
          for (final line in _lines)
            AppRichRow(
              title: line.name,
              subtitle: NumberFormat.decimalPattern(
                l10n.localeName,
              ).format(line.quantity),
              trailing: FinanceAmountText(line.price * line.quantity, currency),
              onTap: _busy
                  ? null
                  : () async {
                      final action = await showAppActionSheet<bool>(
                        context: context,
                        title: line.name,
                        actions: [
                          AppSheetAction(
                            label: l10n.commonDelete,
                            value: true,
                            destructive: true,
                          ),
                        ],
                      );
                      if (mounted && action == true) {
                        setState(() => _lines.remove(line));
                      }
                    },
            ),
          AppButton.secondary(
            onPressed: _busy ? null : _addLine,
            leading: const Icon(LucideIcons.plus),
            child: Text(l10n.financeInvoiceAddProduct),
          ),
          AppTextField(
            controller: _notes,
            label: l10n.financeInvoiceNotes,
            placeholder: l10n.financeInvoiceNotes,
            maxLines: 3,
          ),
        ],
      ),
    );
  }
}

class _InvoiceQuantitySheet extends StatefulWidget {
  const _InvoiceQuantitySheet();

  @override
  State<_InvoiceQuantitySheet> createState() => _InvoiceQuantitySheetState();
}

class _InvoiceQuantitySheetState extends State<_InvoiceQuantitySheet> {
  double? _quantity = 1;

  @override
  Widget build(BuildContext context) => AppSheetScaffold(
    title: context.l10n.inventoryProductAmount,
    actions: [
      AppButton.primary(
        onPressed: _quantity == null
            ? null
            : () => Navigator.of(context).pop(_quantity),
        child: Text(context.l10n.commonSave),
      ),
    ],
    child: AppTextField(
      placeholder: '1',
      keyboardType: const TextInputType.numberWithOptions(decimal: true),
      onChanged: (text) {
        final quantity = double.tryParse(text.trim().replaceAll(',', '.'));
        setState(
          () =>
              _quantity = quantity != null && quantity.isFinite && quantity > 0
              ? quantity
              : null,
        );
      },
    ),
  );
}
