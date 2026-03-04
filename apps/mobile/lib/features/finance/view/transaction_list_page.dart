import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:lucide_icons/lucide_icons.dart' as lucide;
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/utils/transaction_icon.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

// ------------------------------------------------------------------
// Date grouping helpers
// ------------------------------------------------------------------

class _DailyStats {
  _DailyStats({
    required this.income,
    required this.expense,
    required this.count,
    required this.hasConvertedAmounts,
  });

  final double income;
  final double expense;
  final int count;
  final bool hasConvertedAmounts;
  double get netTotal => income + expense; // expense is negative
}

class _DateGroup {
  _DateGroup({
    required this.key,
    required this.fullLabel,
    required this.transactions,
    required this.stats,
  });

  final String key;
  final String fullLabel;
  final List<Transaction> transactions;
  final _DailyStats stats;
}

List<_DateGroup> _groupByDate(
  List<Transaction> transactions,
  AppLocalizations l10n,
  String workspaceCurrency,
  List<ExchangeRate> exchangeRates,
) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  final shortFormat = DateFormat.MMMd();
  final fullFormat = DateFormat('EEEE, dd MMMM yyyy');

  // Use insertion-ordered map keyed by 'yyyy-MM-dd'.
  final orderedKeys = <String>[];
  final groups = <String, List<Transaction>>{};
  final fullLabels = <String, String>{};

  for (final tx in transactions) {
    final date = tx.takenAt ?? tx.createdAt ?? now;
    final day = DateTime(date.year, date.month, date.day);
    final key =
        '${day.year}-${day.month.toString().padLeft(2, '0')}'
        '-${day.day.toString().padLeft(2, '0')}';

    if (!groups.containsKey(key)) {
      orderedKeys.add(key);
      groups[key] = [];
      if (day == today) {
        fullLabels[key] = l10n.financeToday;
      } else if (day == yesterday) {
        fullLabels[key] = l10n.financeYesterday;
      } else {
        final shortLabel = shortFormat.format(day);
        final fullLabel = fullFormat.format(day);
        fullLabels[key] = fullLabel.isEmpty ? shortLabel : fullLabel;
      }
    }
    groups[key]!.add(tx);
  }

  return orderedKeys.map((key) {
    final txList = groups[key]!;
    double income = 0;
    double expense = 0;
    var hasConvertedAmounts = false;
    for (final tx in txList) {
      final amount = tx.amount ?? 0;
      final walletCurrency = tx.walletCurrency ?? workspaceCurrency;
      final isWorkspaceCurrency =
          walletCurrency.toUpperCase() == workspaceCurrency.toUpperCase();
      final converted = convertCurrency(
        amount,
        walletCurrency,
        workspaceCurrency,
        exchangeRates,
      );

      if (!isWorkspaceCurrency && converted == null) {
        continue;
      }

      final amt = isWorkspaceCurrency ? amount : converted!;
      if (!isWorkspaceCurrency) {
        hasConvertedAmounts = true;
      }
      if (amt >= 0) {
        income += amt;
      } else {
        expense += amt;
      }
    }
    return _DateGroup(
      key: key,
      fullLabel: fullLabels[key]!,
      transactions: txList,
      stats: _DailyStats(
        income: income,
        expense: expense,
        count: txList.length,
        hasConvertedAmounts: hasConvertedAmounts,
      ),
    );
  }).toList();
}

// ------------------------------------------------------------------
// Workspace loader
// ------------------------------------------------------------------

Future<void> _loadFromWorkspace(
  BuildContext context,
  TransactionListCubit cubit,
) async {
  final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
  if (ws == null) return;
  unawaited(cubit.load(ws.id));
}

// ------------------------------------------------------------------
// Page entry point
// ------------------------------------------------------------------

class TransactionListPage extends StatelessWidget {
  const TransactionListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
      child: BlocProvider(
        create: (context) {
          final repository = context.read<FinanceRepository>();
          final cubit = TransactionListCubit(
            financeRepository: repository,
          );
          unawaited(_loadFromWorkspace(context, cubit));
          return cubit;
        },
        child: const _TransactionListView(),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Empty / error views
// ------------------------------------------------------------------

class _EmptyView extends StatelessWidget {
  const _EmptyView({required this.hasSearch});

  final bool hasSearch;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            hasSearch ? Icons.search_off : Icons.receipt_long_outlined,
            size: 56,
            color: shad.Theme.of(context).colorScheme.mutedForeground,
          ),
          const shad.Gap(16),
          Text(
            hasSearch
                ? l10n.financeNoSearchResults
                : l10n.financeNoTransactions,
            style: shad.Theme.of(context).typography.textMuted,
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.error_outline,
              size: 56,
              color: shad.Theme.of(context).colorScheme.destructive,
            ),
            const shad.Gap(16),
            Text(
              error ?? l10n.financeTransactions,
              textAlign: TextAlign.center,
            ),
            const shad.Gap(20),
            shad.SecondaryButton(
              onPressed: () async {
                final cubit = context.read<TransactionListCubit>();
                await _loadFromWorkspace(context, cubit);
              },
              child: Text(l10n.commonRetry),
            ),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Main view
// ------------------------------------------------------------------

class _TransactionListView extends StatefulWidget {
  const _TransactionListView();

  @override
  State<_TransactionListView> createState() => _TransactionListViewState();
}

class _TransactionListViewState extends State<_TransactionListView> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  final Map<String, bool> _expandedDays = {};
  Timer? _debounce;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    _searchController.dispose();
    _debounce?.cancel();
    super.dispose();
  }

  Future<void> _onRefresh() async {
    final cubit = context.read<TransactionListCubit>();
    await _loadFromWorkspace(context, cubit);
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.offset;
    if (currentScroll >= maxScroll - 200) {
      unawaited(context.read<TransactionListCubit>().loadMore());
    }
  }

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      unawaited(context.read<TransactionListCubit>().setSearch(query));
    });
  }

  Future<void> _onCreateTransaction() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final toastContext = Navigator.of(context, rootNavigator: true).context;

    final created = await openCreateTransactionSheet(
      context,
      wsId: wsId,
      repository: context.read<FinanceRepository>(),
    );

    if (!mounted || !created) return;
    await _onRefresh();
    if (toastContext.mounted) {
      shad.showToast(
        context: toastContext,
        builder: (ctx, _) => shad.Alert(
          content: Text(ctx.l10n.financeTransactionCreated),
        ),
      );
    }
  }

  bool _isDayExpanded(String key) => _expandedDays[key] ?? true;

  void _toggleDay(String key) {
    setState(() {
      _expandedDays[key] = !(_expandedDays[key] ?? true);
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () {
                final router = GoRouter.of(context);
                if (router.canPop()) {
                  router.pop();
                  return;
                }
                context.go(Routes.finance);
              },
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: Text(l10n.financeTransactions),
          trailing: [
            shad.PrimaryButton(
              onPressed: _onCreateTransaction,
              child: Semantics(
                label: l10n.financeCreateTransaction,
                button: true,
                child: Tooltip(
                  message: l10n.financeCreateTransaction,
                  child: const Icon(Icons.add, size: 16),
                ),
              ),
            ),
          ],
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, _) => unawaited(_onRefresh()),
        child: Column(
          children: [
            // Search bar
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: shad.TextField(
                controller: _searchController,
                hintText: l10n.financeSearchTransactions,
                onChanged: _onSearchChanged,
                features: const [
                  shad.InputFeature.leading(Icon(Icons.search, size: 18)),
                ],
              ),
            ),
            Expanded(
              child: BlocBuilder<TransactionListCubit, TransactionListState>(
                builder: (context, state) {
                  if (state.status == TransactionListStatus.loading &&
                      state.transactions.isEmpty) {
                    return const Center(
                      child: shad.CircularProgressIndicator(),
                    );
                  }

                  if (state.status == TransactionListStatus.error &&
                      state.transactions.isEmpty) {
                    return _ErrorView(error: state.error);
                  }

                  if (state.transactions.isEmpty) {
                    return _EmptyView(hasSearch: state.search.isNotEmpty);
                  }

                  final groups = _groupByDate(
                    state.transactions,
                    l10n,
                    state.workspaceCurrency,
                    state.exchangeRates,
                  );
                  final repository = context.read<FinanceRepository>();
                  return RefreshIndicator(
                    onRefresh: _onRefresh,
                    child: ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.only(top: 8, bottom: 40),
                      itemCount: groups.length + (state.hasMore ? 1 : 0),
                      itemBuilder: (context, index) {
                        if (index >= groups.length) {
                          return const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Center(
                              child: shad.CircularProgressIndicator(),
                            ),
                          );
                        }
                        final group = groups[index];
                        return _DayGroup(
                          group: group,
                          isExpanded: _isDayExpanded(group.key),
                          onToggle: () => _toggleDay(group.key),
                          onRefresh: _onRefresh,
                          repository: repository,
                          currency: state.workspaceCurrency,
                          exchangeRates: state.exchangeRates,
                        );
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Day group card (header + transaction tiles)
// ------------------------------------------------------------------

class _DayGroup extends StatelessWidget {
  const _DayGroup({
    required this.group,
    required this.isExpanded,
    required this.onToggle,
    required this.onRefresh,
    required this.repository,
    required this.currency,
    required this.exchangeRates,
  });

  final _DateGroup group;
  final bool isExpanded;
  final VoidCallback onToggle;
  final Future<void> Function() onRefresh;
  final FinanceRepository repository;
  final String currency;
  final List<ExchangeRate> exchangeRates;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final l10n = context.l10n;
    final colorScheme = theme.colorScheme;
    final stats = group.stats;
    final approximatePrefix = stats.hasConvertedAmounts ? '≈ ' : '';
    final incomeText = stats.income > 0
        ? '$approximatePrefix+${formatCurrency(stats.income, currency)}'
        : null;
    final expenseText = stats.expense < 0
        ? '$approximatePrefix${formatCurrency(stats.expense, currency)}'
        : null;
    final netText = stats.netTotal >= 0
        ? '$approximatePrefix+${formatCurrency(stats.netTotal, currency)}'
        : '$approximatePrefix${formatCurrency(stats.netTotal, currency)}';
    final netColor = stats.netTotal >= 0
        ? colorScheme.primary
        : colorScheme.destructive;

    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 8, 4, 0),
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Group header (accordion trigger) ────────────────
              InkWell(
                onTap: onToggle,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(2, 2, 2, 6),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Date + count row
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              group.fullLabel,
                              style: theme.typography.small.copyWith(
                                fontWeight: FontWeight.w700,
                                color: colorScheme.foreground,
                              ),
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 2,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: colorScheme.muted,
                              borderRadius: BorderRadius.circular(12),
                            ),
                            child: Text(
                              '${stats.count} '
                              '${l10n.financeTransactionCountShort}',
                              style: theme.typography.xSmall.copyWith(
                                color: colorScheme.mutedForeground,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Icon(
                            isExpanded ? Icons.expand_less : Icons.expand_more,
                            size: 18,
                            color: colorScheme.mutedForeground,
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      // Income / expense row
                      Row(
                        children: [
                          Expanded(
                            child: Wrap(
                              spacing: 8,
                              runSpacing: 2,
                              children: [
                                if (incomeText != null)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      const Icon(
                                        Icons.arrow_upward,
                                        size: 12,
                                        color: Colors.green,
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        incomeText,
                                        style: theme.typography.xSmall.copyWith(
                                          color: Colors.green,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                                if (expenseText != null)
                                  Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.arrow_downward,
                                        size: 12,
                                        color: colorScheme.destructive,
                                      ),
                                      const SizedBox(width: 2),
                                      Text(
                                        expenseText,
                                        style: theme.typography.xSmall.copyWith(
                                          color: colorScheme.destructive,
                                          fontWeight: FontWeight.w600,
                                        ),
                                      ),
                                    ],
                                  ),
                              ],
                            ),
                          ),
                          const SizedBox(width: 8),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                '${l10n.financeNet}  ',
                                style: theme.typography.xSmall.copyWith(
                                  color: colorScheme.mutedForeground,
                                ),
                              ),
                              ConstrainedBox(
                                constraints: const BoxConstraints(
                                  maxWidth: 112,
                                ),
                                child: FittedBox(
                                  fit: BoxFit.scaleDown,
                                  alignment: Alignment.centerRight,
                                  child: Text(
                                    netText,
                                    style: theme.typography.xSmall.copyWith(
                                      color: netColor,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 180),
                curve: Curves.easeInOut,
                child: isExpanded
                    ? Column(
                        children: [
                          for (
                            var i = 0;
                            i < group.transactions.length;
                            i++
                          ) ...[
                            _TransactionTile(
                              tx: group.transactions[i],
                              onRefresh: onRefresh,
                              repository: repository,
                              workspaceCurrency: currency,
                              exchangeRates: exchangeRates,
                            ),
                            if (i < group.transactions.length - 1)
                              const SizedBox(height: 8),
                          ],
                          const SizedBox(height: 4),
                        ],
                      )
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Transaction tile
// ------------------------------------------------------------------

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({
    required this.tx,
    required this.onRefresh,
    required this.repository,
    required this.workspaceCurrency,
    required this.exchangeRates,
  });

  final Transaction tx;
  final Future<void> Function() onRefresh;
  final FinanceRepository repository;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;

  /// Parse a hex color string (e.g. '#ff0000' or 'ff0000') to a Flutter Color.
  Color? _parseHex(String? hex) {
    if (hex == null) return null;
    final cleaned = hex.replaceFirst('#', '');
    if (cleaned.length != 6 && cleaned.length != 8) return null;
    final value = int.tryParse(
      cleaned.length == 6 ? 'FF$cleaned' : cleaned,
      radix: 16,
    );
    return value != null ? Color(value) : null;
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final amount = tx.amount ?? 0;
    final isExpense = amount < 0;
    final currency = tx.walletCurrency ?? workspaceCurrency;
    final convertedAmount = convertCurrency(
      amount,
      currency,
      workspaceCurrency,
      exchangeRates,
    );
    final showConvertedAmount =
        convertedAmount != null &&
        currency.toUpperCase() != workspaceCurrency.toUpperCase();

    // Title: description wins, fallback to category name
    final hasDescription = tx.description?.isNotEmpty ?? false;
    final title = hasDescription ? tx.description! : (tx.categoryName ?? '—');

    // Category color / icon
    final categoryColor =
        _parseHex(tx.categoryColor) ??
        (isExpense ? colorScheme.destructive : colorScheme.primary);

    // Amount text
    final amountText = isExpense
        ? formatCurrency(amount, currency)
        : '+${formatCurrency(amount, currency)}';
    final convertedAmountText = showConvertedAmount
        ? (convertedAmount >= 0
              ? '≈ +${formatCurrency(convertedAmount, workspaceCurrency)}'
              : '≈ ${formatCurrency(convertedAmount, workspaceCurrency)}')
        : null;

    final categoryIcon = resolveTransactionCategoryIcon(tx);

    return shad.Card(
      padding: EdgeInsets.zero,
      borderColor: categoryColor.withValues(alpha: 0.35),
      borderWidth: 1,
      child: shad.GhostButton(
        onPressed: () async {
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId == null) return;

          final changed = await openTransactionDetailSheet(
            context,
            wsId: wsId,
            transaction: tx,
            repository: repository,
            workspaceCurrency: workspaceCurrency,
            exchangeRates: exchangeRates,
          );

          if (!context.mounted || !changed) return;
          await onRefresh();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Category color indicator ──────────────────────
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: categoryColor.withValues(alpha: 0.15),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    categoryIcon,
                    size: 17,
                    color: categoryColor,
                  ),
                ),
              ),
              const SizedBox(width: 12),
              // ── Content ───────────────────────────────────────
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Title
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.p.copyWith(
                        fontWeight: FontWeight.w500,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 5),
                    // Chips row: category + wallet
                    Wrap(
                      spacing: 6,
                      runSpacing: 4,
                      children: [
                        if (tx.categoryName != null)
                          _Chip(
                            label: tx.categoryName!,
                            icon: categoryIcon,
                            color: categoryColor,
                          ),
                        if (tx.walletName != null)
                          _Chip(
                            label: tx.walletName!,
                            leading: WalletVisualAvatar(
                              icon: tx.walletIcon,
                              imageSrc: tx.walletImageSrc,
                              fallbackIcon: lucide.LucideIcons.walletCards,
                              size: 14,
                            ),
                          ),
                        if (tx.isTransfer && tx.transfer != null)
                          _Chip(
                            label: tx.transfer!.linkedWalletName,
                            icon: lucide.LucideIcons.repeat2,
                            color: colorScheme.ring,
                          ),
                      ],
                    ),
                    // Tags (if any)
                    if (tx.tags.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Wrap(
                        spacing: 4,
                        runSpacing: 2,
                        children: tx.tags.map((tag) {
                          final tagColor = _parseHex(tag.color);
                          return Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 1,
                            ),
                            decoration: BoxDecoration(
                              color: (tagColor ?? colorScheme.ring).withValues(
                                alpha: 0.12,
                              ),
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(
                                color: (tagColor ?? colorScheme.ring)
                                    .withValues(
                                      alpha: 0.3,
                                    ),
                              ),
                            ),
                            child: Text(
                              tag.name,
                              style: theme.typography.xSmall.copyWith(
                                color: tagColor ?? colorScheme.mutedForeground,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              // ── Amount ────────────────────────────────────────
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 110),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerRight,
                      child: Text(
                        amountText,
                        maxLines: 1,
                        style: theme.typography.p.copyWith(
                          fontWeight: FontWeight.w700,
                          color: isExpense
                              ? colorScheme.destructive
                              : Colors.green,
                        ),
                      ),
                    ),
                    if (tx.isTransfer)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          context.l10n.financeTransfer,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                    if (convertedAmountText != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text(
                          convertedAmountText,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Reusable chip widget
// ------------------------------------------------------------------

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.icon, this.leading, this.color});

  final String label;
  final IconData? icon;
  final Widget? leading;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final effectiveColor = color ?? colorScheme.mutedForeground;

    return Container(
      constraints: const BoxConstraints(maxWidth: 140),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
      decoration: BoxDecoration(
        color: effectiveColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: effectiveColor.withValues(alpha: 0.25),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[
            leading!,
            const SizedBox(width: 4),
          ] else if (icon != null) ...[
            Icon(icon, size: 11, color: effectiveColor.withValues(alpha: 0.8)),
            const SizedBox(width: 3),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: effectiveColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
