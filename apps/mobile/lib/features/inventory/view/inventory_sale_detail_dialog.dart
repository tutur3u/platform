part of 'inventory_sales_page.dart';

class _InventorySaleDetailDialog extends StatefulWidget {
  const _InventorySaleDetailDialog({
    required this.wsId,
    required this.saleId,
    required this.currency,
    required this.inventoryRepository,
    required this.financeRepository,
    required this.canUpdateSales,
    required this.canDeleteSales,
  });

  final String wsId;
  final String saleId;
  final String currency;
  final InventoryRepository inventoryRepository;
  final FinanceRepository financeRepository;
  final bool canUpdateSales;
  final bool canDeleteSales;

  @override
  State<_InventorySaleDetailDialog> createState() =>
      _InventorySaleDetailDialogState();
}

class _InventorySaleDetailDialogState
    extends State<_InventorySaleDetailDialog> {
  late Future<InventorySaleDetail> _future;

  @override
  void initState() {
    super.initState();
    _future = widget.inventoryRepository.getSaleDetail(
      widget.wsId,
      widget.saleId,
    );
  }

  Future<void> _reload() async {
    setState(() {
      _future = widget.inventoryRepository.getSaleDetail(
        widget.wsId,
        widget.saleId,
      );
    });
  }

  String _feedback(String confirmed) {
    final edits = OfflineMutationQueue.instance.pending.value.where(
      (edit) =>
          edit.feature == 'inventory' &&
          edit.workspaceId == widget.wsId &&
          edit.entityId == widget.saleId,
    );
    return edits.isEmpty ? confirmed : context.l10n.offlineEditQueued;
  }

  Future<void> _showEditDialog(InventorySaleDetail sale) async {
    final updated = await showInventoryCheckoutPage<InventorySaleDetail>(
      context,
      sale: sale,
      initialSalesPeriods: sale.period == null ? const [] : [sale.period!],
    );

    if (updated != null && mounted) {
      showInventoryToast(context, _feedback(context.l10n.inventorySaleUpdated));
      Navigator.of(context).pop(true);
    }
  }

  Future<void> _showDeleteDialog(InventorySaleDetail sale) async {
    final sheetNavigator = Navigator.of(context);
    await shad.showDialog<bool>(
      context: context,
      builder: (_) => AsyncDeleteConfirmationDialog(
        toastContext: context,
        maxWidth: MediaQuery.of(context).size.width * 0.85,
        title: context.l10n.inventorySalesDelete,
        message: context.l10n.inventorySalesDeleteConfirm,
        cancelLabel: context.l10n.commonCancel,
        confirmLabel: context.l10n.inventorySalesDelete,
        onConfirm: () async {
          await widget.inventoryRepository.deleteSale(widget.wsId, sale.id);
          if (!mounted) return;
          showInventoryToast(
            context,
            _feedback(context.l10n.inventorySaleDeleted),
          );
          sheetNavigator.pop(true);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder<InventorySaleDetail>(
      future: _future,
      builder: (context, snapshot) {
        if (!snapshot.hasData &&
            snapshot.connectionState != ConnectionState.done) {
          return const Center(child: NovaLoadingIndicator());
        }

        if (snapshot.hasError || !snapshot.hasData) {
          return AppDialogScaffold(
            title: l10n.commonSomethingWentWrong,
            icon: Icons.error_outline,
            actions: [
              shad.OutlineButton(
                onPressed: () => Navigator.of(context).pop(false),
                child: Text(l10n.commonCancel),
              ),
              shad.PrimaryButton(
                onPressed: _reload,
                child: Text(l10n.commonRetry),
              ),
            ],
            child: Text(snapshot.error?.toString() ?? l10n.inventorySalesLabel),
          );
        }

        final sale = snapshot.data!;
        final pendingCreate = OfflineMutationQueue.instance.pending.value.any(
          (edit) =>
              edit.workspaceId == widget.wsId &&
              edit.entityId == widget.saleId &&
              edit.method == 'POST',
        );
        final title = sale.notice?.trim().isNotEmpty == true
            ? sale.notice!.trim()
            : l10n.inventorySalesFallbackTitle;

        return AppDialogScaffold(
          title: title,
          icon: Icons.receipt_long_outlined,
          maxWidth: 720,
          actions: [
            shad.OutlineButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: Text(l10n.commonCancel),
            ),
            if (widget.canUpdateSales)
              shad.SecondaryButton(
                onPressed: () => _showEditDialog(sale),
                child: Text(l10n.inventorySalesEdit),
              ),
            if (widget.canDeleteSales)
              shad.DestructiveButton(
                onPressed: () => _showDeleteDialog(sale),
                child: Text(l10n.inventorySalesDelete),
              ),
          ],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                pendingCreate
                    ? l10n.offlineEditQueued
                    : formatCurrency(sale.paidAmount, widget.currency),
                style: shad.Theme.of(
                  context,
                ).typography.h2.copyWith(fontWeight: FontWeight.w900),
              ),
              const shad.Gap(8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (sale.creatorName?.trim().isNotEmpty ?? false)
                    _SaleBadge(
                      label: l10n.inventorySalesCreatorBadge(
                        sale.creatorName!.trim(),
                      ),
                      color: FinancePalette.of(context).accent,
                    ),
                  ...sale.owners
                      .where((owner) => owner.trim().isNotEmpty)
                      .map(
                        (owner) => _SaleBadge(
                          label: owner,
                          color: FinancePalette.of(context).positive,
                        ),
                      ),
                  if (sale.customerName?.trim().isNotEmpty ?? false)
                    _SaleBadge(
                      label: sale.customerName!.trim(),
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                ],
              ),
              const shad.Gap(16),
              _DetailInfoGrid(currency: widget.currency, sale: sale),
              if (sale.lines.isNotEmpty) ...[
                const shad.Gap(18),
                FinanceSectionHeader(title: l10n.inventorySalesLineItems),
                const shad.Gap(12),
                ...sale.lines.map((line) {
                  final quantityText = line.quantity.toStringAsFixed(
                    line.quantity % 1 == 0 ? 0 : 1,
                  );

                  return Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: FinancePanel(
                      radius: 18,
                      padding: const EdgeInsets.all(14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  line.productName,
                                  style: shad.Theme.of(context).typography.small
                                      .copyWith(fontWeight: FontWeight.w800),
                                ),
                              ),
                              Text(
                                formatCurrency(
                                  line.price * line.quantity,
                                  widget.currency,
                                ),
                                style: shad.Theme.of(context).typography.small
                                    .copyWith(fontWeight: FontWeight.w800),
                              ),
                            ],
                          ),
                          const shad.Gap(6),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              if (line.ownerName?.trim().isNotEmpty ?? false)
                                _SaleBadge(
                                  label: line.ownerName!.trim(),
                                  color: FinancePalette.of(context).positive,
                                ),
                              if (line.warehouseName?.trim().isNotEmpty ??
                                  false)
                                _SaleBadge(
                                  label: line.warehouseName!.trim(),
                                  color: shad.Theme.of(
                                    context,
                                  ).colorScheme.mutedForeground,
                                ),
                              if (line.unitName?.trim().isNotEmpty ?? false)
                                _SaleBadge(
                                  label: line.unitName!.trim(),
                                  color: FinancePalette.of(context).accent,
                                ),
                            ],
                          ),
                          const shad.Gap(8),
                          Text(
                            '${formatCurrency(line.price, widget.currency)} '
                            '× $quantityText',
                            style: shad.Theme.of(context).typography.textSmall
                                .copyWith(
                                  color: shad.Theme.of(
                                    context,
                                  ).colorScheme.mutedForeground,
                                ),
                          ),
                        ],
                      ),
                    ),
                  );
                }),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _DetailInfoGrid extends StatelessWidget {
  const _DetailInfoGrid({required this.currency, required this.sale});

  final String currency;
  final InventorySaleDetail sale;

  @override
  Widget build(BuildContext context) {
    final items = <Widget>[
      _DetailStat(
        label: context.l10n.inventoryCheckoutWallet,
        value: sale.walletName ?? '—',
      ),
      _DetailStat(
        label: context.l10n.inventoryCheckoutCategoryOverride,
        value: sale.categoryName ?? '—',
      ),
      _DetailStat(
        label: context.l10n.inventoryCheckoutSelectedItems,
        value: '${sale.itemsCount}',
      ),
      _DetailStat(
        label: context.l10n.inventoryCheckoutCartTotal,
        value: formatCurrency(sale.paidAmount, currency),
      ),
    ];

    if (sale.note?.trim().isNotEmpty ?? false) {
      items.add(
        _DetailStat(
          label: context.l10n.inventorySalesNote,
          value: sale.note!.trim(),
          fullWidth: true,
        ),
      );
    }

    items.add(
      _DetailStat(
        label: context.l10n.inventoryAuditRecentTitle,
        value: DateFormat.yMMMd().add_jm().format(
          sale.createdAt?.toLocal() ?? DateTime.now(),
        ),
        fullWidth: true,
      ),
    );

    return Wrap(spacing: 10, runSpacing: 10, children: items);
  }
}

class _DetailStat extends StatelessWidget {
  const _DetailStat({
    required this.label,
    required this.value,
    this.fullWidth = false,
  });

  final String label;
  final String value;
  final bool fullWidth;

  @override
  Widget build(BuildContext context) {
    final child = FinancePanel(
      radius: 18,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: shad.Theme.of(context).typography.xSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(4),
          Text(
            value,
            style: shad.Theme.of(
              context,
            ).typography.small.copyWith(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );

    if (fullWidth) {
      return SizedBox(width: double.infinity, child: child);
    }

    return ConstrainedBox(
      constraints: const BoxConstraints(minWidth: 180, maxWidth: 220),
      child: child,
    );
  }
}
