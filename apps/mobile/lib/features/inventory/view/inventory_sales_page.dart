import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/inventory_permissions.dart';
import 'package:mobile/features/inventory/view/inventory_checkout_page.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class InventorySalesPage extends StatefulWidget {
  const InventorySalesPage({super.key});

  @override
  State<InventorySalesPage> createState() => _InventorySalesPageState();
}

class _InventorySalesPageState extends State<InventorySalesPage> {
  static const int _pageSize = 24;

  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final WorkspacePermissionsRepository _permissionsRepository;
  final ScrollController _scrollController = ScrollController();

  List<InventorySaleSummary> _sales = const [];
  int _count = 0;
  String _currency = 'USD';
  bool _canCreateSales = false;
  bool _canUpdateSales = false;
  bool _canDeleteSales = false;
  bool _isLoadingInitial = false;
  bool _isLoadingMore = false;
  bool _hasMore = true;
  String? _error;
  int _requestToken = 0;

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = InventoryRepository();
    _financeRepository = FinanceRepository();
    _permissionsRepository = WorkspacePermissionsRepository();
    _scrollController.addListener(_onScroll);
    unawaited(Future<void>.delayed(Duration.zero, _loadInitial));
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  Future<void> _loadInitial() async {
    final wsId = _wsId;
    if (wsId == null) {
      return;
    }
    final requestToken = ++_requestToken;

    setState(() {
      _isLoadingInitial = true;
      _isLoadingMore = false;
      _error = null;
    });

    try {
      final results = await Future.wait<dynamic>([
        _inventoryRepository.getSales(wsId, limit: _pageSize),
        _financeRepository.getWorkspaceDefaultCurrency(wsId),
        _permissionsRepository.getPermissions(wsId: wsId),
      ]);

      if (!mounted || requestToken != _requestToken) {
        return;
      }

      final sales =
          results[0]
              as ({
                List<InventorySaleSummary> data,
                int count,
                bool realtimeEnabled,
              });
      final currency = results[1] as String;
      final permissions = results[2] as WorkspacePermissions;

      setState(() {
        _sales = sales.data;
        _count = sales.count;
        _currency = currency;
        _canCreateSales = canCreateInventorySales(permissions);
        _canUpdateSales = canUpdateInventorySales(permissions);
        _canDeleteSales = canDeleteInventorySales(permissions);
        _hasMore = _sales.length < _count;
        _error = null;
      });
    } on ApiException catch (error) {
      if (!mounted || requestToken != _requestToken) {
        return;
      }
      setState(() {
        _error = error.message.isNotEmpty
            ? error.message
            : context.l10n.commonSomethingWentWrong;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken) {
        return;
      }
      setState(() {
        _error = context.l10n.commonSomethingWentWrong;
      });
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoadingInitial = false;
        });
      }
    }
  }

  Future<void> _loadMore() async {
    final wsId = _wsId;
    final requestToken = _requestToken;
    if (wsId == null || _isLoadingInitial || _isLoadingMore || !_hasMore) {
      return;
    }

    setState(() {
      _isLoadingMore = true;
    });

    try {
      final result = await _inventoryRepository.getSales(
        wsId,
        limit: _pageSize,
        offset: _sales.length,
      );

      if (!mounted || requestToken != _requestToken) {
        return;
      }

      setState(() {
        _sales = [..._sales, ...result.data];
        _count = result.count;
        _hasMore = _sales.length < _count;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken) {
        return;
      }
      setState(() {
        _hasMore = _sales.length < _count;
      });
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() {
          _isLoadingMore = false;
        });
      }
    }
  }

  void _onScroll() {
    if (!_scrollController.hasClients) {
      return;
    }
    final position = _scrollController.position;
    if (position.maxScrollExtent - position.pixels <= 200) {
      unawaited(_loadMore());
    }
  }

  Future<void> _openCheckout() async {
    final created = await showInventoryCheckoutPage<bool>(context);
    if (created == true && mounted) {
      await _loadInitial();
    }
  }

  Future<void> _openSaleDetail({
    required String saleId,
    required String currency,
    required bool canUpdateSales,
    required bool canDeleteSales,
  }) async {
    final changed = await showAdaptiveSheet<bool>(
      context: context,
      maxDialogWidth: 720,
      builder: (_) => _InventorySaleDetailDialog(
        wsId: _wsId!,
        saleId: saleId,
        currency: currency,
        inventoryRepository: _inventoryRepository,
        financeRepository: _financeRepository,
        canUpdateSales: canUpdateSales,
        canDeleteSales: canDeleteSales,
      ),
    );

    if (changed == true && mounted) {
      await _loadInitial();
    }
  }

  @override
  Widget build(BuildContext context) {
    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (previous, current) =>
            previous.currentWorkspace?.id != current.currentWorkspace?.id,
        listener: (context, state) => unawaited(_loadInitial()),
        child: Builder(
          builder: (context) {
            if (_isLoadingInitial && _sales.isEmpty) {
              return const Center(child: NovaLoadingIndicator());
            }

            if (_error != null && _sales.isEmpty) {
              return _InventorySalesError(
                onRetry: () => unawaited(_loadInitial()),
              );
            }

            final l10n = context.l10n;
            final revenue = _sales.fold<double>(
              0,
              (sum, sale) => sum + sale.paidAmount,
            );

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(
                context.deviceClass,
              ),
              child: Stack(
                children: [
                  RefreshIndicator(
                    onRefresh: _loadInitial,
                    child: ListView(
                      controller: _scrollController,
                      physics: const AlwaysScrollableScrollPhysics(),
                      padding: EdgeInsets.fromLTRB(
                        16,
                        8,
                        16,
                        108 + MediaQuery.paddingOf(context).bottom,
                      ),
                      children: [
                        FinancePanel(
                          child: Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              FinanceStatChip(
                                label: l10n.inventorySalesLabel,
                                value: '$_count',
                                icon: Icons.receipt_long_outlined,
                              ),
                              FinanceStatChip(
                                label: l10n.inventoryOverviewSalesRevenue,
                                value: formatCurrency(revenue, _currency),
                                icon: Icons.payments_outlined,
                              ),
                            ],
                          ),
                        ),
                        const shad.Gap(18),
                        if (_sales.isEmpty)
                          FinanceEmptyState(
                            icon: Icons.receipt_long_outlined,
                            title: l10n.inventorySalesLabel,
                            body: l10n.inventorySalesEmpty,
                            action: _canCreateSales
                                ? shad.SecondaryButton(
                                    onPressed: _openCheckout,
                                    child: Text(l10n.inventoryCheckoutTitle),
                                  )
                                : null,
                          )
                        else ...[
                          FinanceSectionHeader(
                            title: l10n.inventorySalesRecentTitle,
                          ),
                          const shad.Gap(12),
                          ..._sales.map(
                            (sale) => Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: _InventorySaleCard(
                                sale: sale,
                                currency: _currency,
                                onTap: () => _openSaleDetail(
                                  saleId: sale.id,
                                  currency: _currency,
                                  canUpdateSales: _canUpdateSales,
                                  canDeleteSales: _canDeleteSales,
                                ),
                              ),
                            ),
                          ),
                          if (_isLoadingMore)
                            const Padding(
                              padding: EdgeInsets.symmetric(vertical: 16),
                              child: Center(
                                child: shad.CircularProgressIndicator(),
                              ),
                            ),
                        ],
                      ],
                    ),
                  ),
                  if (_canCreateSales)
                    ExtendedFab(
                      icon: Icons.point_of_sale_rounded,
                      label: l10n.inventoryCheckoutTitle,
                      includeBottomSafeArea: false,
                      onPressed: _openCheckout,
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

class _InventorySaleCard extends StatelessWidget {
  const _InventorySaleCard({
    required this.sale,
    required this.currency,
    required this.onTap,
  });

  final InventorySaleSummary sale;
  final String currency;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final title = sale.notice?.trim().isNotEmpty == true
        ? sale.notice!.trim()
        : context.l10n.inventorySalesFallbackTitle;
    final metadata = [
      if (sale.walletName?.isNotEmpty ?? false) sale.walletName!,
      if (sale.categoryName?.isNotEmpty ?? false) sale.categoryName!,
      context.l10n.inventorySalesItemsCount(sale.itemsCount),
    ].join(' • ');
    final creator = sale.creatorName?.trim();
    final customer = sale.customerName?.trim();

    return FinancePanel(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              const shad.Gap(12),
              Text(
                formatCurrency(sale.paidAmount, currency),
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          if (metadata.isNotEmpty) ...[
            const shad.Gap(8),
            Text(
              metadata,
              style: theme.typography.textSmall.copyWith(
                color: theme.colorScheme.mutedForeground,
              ),
            ),
          ],
          const shad.Gap(10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (creator != null && creator.isNotEmpty)
                _SaleBadge(
                  label: context.l10n.inventorySalesCreatorBadge(creator),
                  color: FinancePalette.of(context).accent,
                ),
              ...sale.owners
                  .where((owner) => owner.trim().isNotEmpty)
                  .map(
                    (owner) => _SaleBadge(
                      label: owner.trim(),
                      color: FinancePalette.of(context).positive,
                    ),
                  ),
              if (customer != null && customer.isNotEmpty)
                _SaleBadge(
                  label: customer,
                  color: theme.colorScheme.mutedForeground,
                ),
            ],
          ),
          const shad.Gap(10),
          Row(
            children: [
              Expanded(
                child: Text(
                  DateFormat.yMMMd().add_jm().format(
                    sale.createdAt?.toLocal() ?? DateTime.now(),
                  ),
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

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

  Future<void> _showEditDialog(InventorySaleDetail sale) async {
    final updated = await showAdaptiveSheet<InventorySaleDetail>(
      context: context,
      maxDialogWidth: 520,
      builder: (_) => _EditInventorySaleDialog(
        wsId: widget.wsId,
        sale: sale,
        inventoryRepository: widget.inventoryRepository,
        financeRepository: widget.financeRepository,
      ),
    );

    if (updated != null && mounted) {
      showInventoryToast(context, context.l10n.inventorySaleUpdated);
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
          showInventoryToast(context, context.l10n.inventorySaleDeleted);
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
            child: Text(
              snapshot.error?.toString() ?? l10n.inventorySalesLabel,
            ),
          );
        }

        final sale = snapshot.data!;
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
                formatCurrency(sale.paidAmount, widget.currency),
                style: shad.Theme.of(context).typography.h2.copyWith(
                  fontWeight: FontWeight.w900,
                ),
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
              _DetailInfoGrid(
                currency: widget.currency,
                sale: sale,
              ),
              if (sale.lines.isNotEmpty) ...[
                const shad.Gap(18),
                FinanceSectionHeader(title: l10n.inventorySalesLineItems),
                const shad.Gap(12),
                ...sale.lines.map(
                  (line) {
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
                                    style: shad.Theme.of(context)
                                        .typography
                                        .small
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
                  },
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class _DetailInfoGrid extends StatelessWidget {
  const _DetailInfoGrid({
    required this.currency,
    required this.sale,
  });

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

    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: items,
    );
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
            style: shad.Theme.of(context).typography.small.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );

    if (fullWidth) {
      return SizedBox(width: double.infinity, child: child);
    }

    return ConstrainedBox(
      constraints: const BoxConstraints(
        minWidth: 180,
        maxWidth: 220,
      ),
      child: child,
    );
  }
}

class _EditInventorySaleDialog extends StatefulWidget {
  const _EditInventorySaleDialog({
    required this.wsId,
    required this.sale,
    required this.inventoryRepository,
    required this.financeRepository,
  });

  final String wsId;
  final InventorySaleDetail sale;
  final InventoryRepository inventoryRepository;
  final FinanceRepository financeRepository;

  @override
  State<_EditInventorySaleDialog> createState() =>
      _EditInventorySaleDialogState();
}

class _EditInventorySaleDialogState extends State<_EditInventorySaleDialog> {
  late final TextEditingController _noticeController;
  late final TextEditingController _noteController;
  List<Wallet> _wallets = const [];
  List<TransactionCategory> _categories = const [];
  String? _walletId;
  String? _categoryId;
  bool _loading = true;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _noticeController = TextEditingController(text: widget.sale.notice ?? '');
    _noteController = TextEditingController(text: widget.sale.note ?? '');
    _walletId = widget.sale.walletId;
    _categoryId = widget.sale.categoryId;
    unawaited(_load());
  }

  @override
  void dispose() {
    _noticeController.dispose();
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final results = await Future.wait<dynamic>([
      widget.financeRepository.getWallets(widget.wsId),
      widget.financeRepository.getCategories(widget.wsId),
    ]);

    if (!mounted) {
      return;
    }

    setState(() {
      _wallets = results[0] as List<Wallet>;
      _categories = (results[1] as List<TransactionCategory>)
          .where((item) => !(item.isExpense ?? false))
          .toList(growable: false);
      _walletId = _walletId ?? (_wallets.isEmpty ? null : _wallets.first.id);
      _loading = false;
    });
  }

  Future<void> _save() async {
    if (_walletId == null || _walletId!.isEmpty) {
      showInventoryToast(
        context,
        context.l10n.inventoryCheckoutWalletRequired,
        destructive: true,
      );
      return;
    }

    setState(() => _saving = true);
    try {
      final updated = await widget.inventoryRepository.updateSale(
        wsId: widget.wsId,
        saleId: widget.sale.id,
        notice: _noticeController.text.trim().isEmpty
            ? null
            : _noticeController.text.trim(),
        note: _noteController.text.trim().isEmpty
            ? null
            : _noteController.text.trim(),
        walletId: _walletId,
        categoryId: _categoryId,
      );

      if (!mounted) return;
      Navigator.of(context).pop(updated);
    } on ApiException catch (error) {
      if (!mounted) return;
      showInventoryToast(context, error.message, destructive: true);
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppDialogScaffold(
      title: context.l10n.inventorySalesEdit,
      icon: Icons.edit_outlined,
      maxWidth: 520,
      maxHeightFactor: 0.78,
      actions: [
        shad.OutlineButton(
          onPressed: _saving ? null : () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: _loading || _saving ? null : _save,
          child: _saving
              ? const SizedBox.square(
                  dimension: 16,
                  child: shad.CircularProgressIndicator(strokeWidth: 2),
                )
              : Text(context.l10n.inventorySalesSave),
        ),
      ],
      child: _loading
          ? const Center(child: NovaLoadingIndicator())
          : Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: _noticeController,
                  decoration: InputDecoration(
                    labelText: context.l10n.inventorySalesTitle,
                  ),
                ),
                const shad.Gap(12),
                TextField(
                  controller: _noteController,
                  minLines: 3,
                  maxLines: 5,
                  decoration: InputDecoration(
                    labelText: context.l10n.inventorySalesNote,
                  ),
                ),
                const shad.Gap(12),
                DropdownButtonFormField<String>(
                  initialValue: _walletId,
                  items: _wallets
                      .map(
                        (wallet) => DropdownMenuItem<String>(
                          value: wallet.id,
                          child: Text(wallet.name ?? ''),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) => setState(() => _walletId = value),
                  decoration: InputDecoration(
                    labelText: context.l10n.inventoryCheckoutWallet,
                  ),
                ),
                const shad.Gap(12),
                DropdownButtonFormField<String>(
                  initialValue: _categoryId,
                  items: _categories
                      .map(
                        (category) => DropdownMenuItem<String>(
                          value: category.id,
                          child: Text(category.name ?? ''),
                        ),
                      )
                      .toList(growable: false),
                  onChanged: (value) => setState(() => _categoryId = value),
                  decoration: InputDecoration(
                    labelText: context.l10n.inventoryCheckoutCategoryOverride,
                  ),
                ),
              ],
            ),
    );
  }
}

class _SaleBadge extends StatelessWidget {
  const _SaleBadge({
    required this.label,
    required this.color,
  });

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.22)),
      ),
      child: Text(
        label,
        style: theme.typography.xSmall.copyWith(
          color: color,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _InventorySalesError extends StatelessWidget {
  const _InventorySalesError({required this.onRetry});

  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: FinanceEmptyState(
        icon: Icons.error_outline,
        title: context.l10n.commonSomethingWentWrong,
        body: context.l10n.inventorySalesLabel,
        action: shad.SecondaryButton(
          onPressed: onRetry,
          child: Text(context.l10n.commonRetry),
        ),
      ),
    );
  }
}
