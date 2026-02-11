import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

List<_DateGroup> _groupByDate(List<Transaction> transactions) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final yesterday = today.subtract(const Duration(days: 1));
  final dateFormat = DateFormat.yMMMd();

  final groups = <String, List<Transaction>>{};
  final labels = <String, String>{};

  for (final tx in transactions) {
    final date = tx.takenAt ?? tx.createdAt ?? now;
    final day = DateTime(date.year, date.month, date.day);
    final key = '${day.year}-${day.month}-${day.day}';

    groups.putIfAbsent(key, () => []).add(tx);

    if (!labels.containsKey(key)) {
      if (day == today) {
        labels[key] = 'Today';
      } else if (day == yesterday) {
        labels[key] = 'Yesterday';
      } else {
        labels[key] = dateFormat.format(day);
      }
    }
  }

  return groups.entries
      .map(
        (e) => _DateGroup(label: labels[e.key]!, transactions: e.value),
      )
      .toList();
}

Future<void> _loadFromWorkspace(
  BuildContext context,
  TransactionListCubit cubit,
) async {
  final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
  if (ws == null) return;
  final repo = FinanceRepository();
  final wallets = await repo.getWallets(ws.id);
  final walletIds = wallets.map((w) => w.id).toList();
  unawaited(cubit.load(walletIds));
}

class TransactionListPage extends StatelessWidget {
  const TransactionListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = TransactionListCubit(
          financeRepository: FinanceRepository(),
        );
        unawaited(_loadFromWorkspace(context, cubit));
        return cubit;
      },
      child: const _TransactionListView(),
    );
  }
}

// ------------------------------------------------------------------
// Grouping helpers
// ------------------------------------------------------------------

class _DateGroup {
  _DateGroup({required this.label, required this.transactions});
  final String label;
  final List<Transaction> transactions;
}

// ------------------------------------------------------------------
// Date section header
// ------------------------------------------------------------------

class _DateHeader extends StatelessWidget {
  const _DateHeader({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(
        label,
        style: shad.Theme.of(context).typography.small.copyWith(
          fontWeight: FontWeight.w600,
          color: shad.Theme.of(context).colorScheme.mutedForeground,
        ),
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
            size: 48,
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: shad.Theme.of(context).colorScheme.destructive,
          ),
          const shad.Gap(16),
          Text(
            error ?? l10n.financeTransactions,
            textAlign: TextAlign.center,
          ),
          const shad.Gap(16),
          shad.SecondaryButton(
            onPressed: () async {
              final cubit = context.read<TransactionListCubit>();
              await _loadFromWorkspace(context, cubit);
            },
            child: Text(l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------
// Flat list item (either header or transaction)
// ------------------------------------------------------------------

class _ListItem {
  _ListItem.header(this.label) : transaction = null;
  _ListItem.transaction(this.transaction) : label = null;

  final String? label;
  final Transaction? transaction;

  bool get isHeader => label != null;
}

class _TransactionListView extends StatefulWidget {
  const _TransactionListView();

  @override
  State<_TransactionListView> createState() => _TransactionListViewState();
}

class _TransactionListViewState extends State<_TransactionListView> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  Timer? _debounce;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        shad.AppBar(
          leading: [
            shad.OutlineButton(
              density: shad.ButtonDensity.icon,
              onPressed: () => context.pop(),
              child: const Icon(Icons.arrow_back),
            ),
          ],
          title: Text(l10n.financeTransactions),
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, _) => unawaited(_onRefresh()),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: shad.TextField(
                controller: _searchController,
                hintText: l10n.financeSearchTransactions,
                onChanged: _onSearchChanged,
                features: const [
                  shad.InputFeature.leading(Icon(Icons.search, size: 20)),
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

                  return _TransactionsList(
                    transactions: state.transactions,
                    hasMore: state.hasMore,
                    isLoadingMore: state.isLoadingMore,
                    scrollController: _scrollController,
                    onRefresh: _onRefresh,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
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

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  Future<void> _onRefresh() async {
    final cubit = context.read<TransactionListCubit>();
    await _loadFromWorkspace(context, cubit);
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.offset;
    // Trigger load when 200px from bottom.
    if (currentScroll >= maxScroll - 200) {
      unawaited(
        context.read<TransactionListCubit>().loadMore(),
      );
    }
  }

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      unawaited(
        context.read<TransactionListCubit>().setSearch(query),
      );
    });
  }
}

// ------------------------------------------------------------------
// Grouped transaction list with date headers
// ------------------------------------------------------------------

class _TransactionsList extends StatelessWidget {
  const _TransactionsList({
    required this.transactions,
    required this.hasMore,
    required this.isLoadingMore,
    required this.scrollController,
    required this.onRefresh,
  });

  final List<Transaction> transactions;
  final bool hasMore;
  final bool isLoadingMore;
  final ScrollController scrollController;
  final Future<void> Function() onRefresh;

  @override
  Widget build(BuildContext context) {
    final groups = _groupByDate(transactions);

    // Flatten into a list of widgets: headers + tiles.
    final items = <_ListItem>[];
    for (final group in groups) {
      items.add(_ListItem.header(group.label));
      for (final tx in group.transactions) {
        items.add(_ListItem.transaction(tx));
      }
    }

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: ListView.builder(
        controller: scrollController,
        padding: const EdgeInsets.only(bottom: 32),
        itemCount: items.length + (hasMore ? 1 : 0),
        itemBuilder: (context, index) {
          if (index >= items.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: shad.CircularProgressIndicator()),
            );
          }
          final item = items[index];
          if (item.isHeader) return _DateHeader(label: item.label!);
          return _TransactionTile(tx: item.transaction!);
        },
      ),
    );
  }
}

// ------------------------------------------------------------------
// Transaction tile
// ------------------------------------------------------------------

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({required this.tx});

  final Transaction tx;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final amount = tx.amount ?? 0;
    final isExpense = amount < 0;
    final currency = tx.walletCurrency ?? 'USD';

    final hasDescription = tx.description?.isNotEmpty ?? false;
    final title = hasDescription ? tx.description! : (tx.categoryName ?? '');

    final subtitle = [
      if (tx.categoryName != null && hasDescription) tx.categoryName!,
      if (tx.walletName != null) tx.walletName!,
    ].join(' \u00b7 ');

    return shad.GhostButton(
      // TODO(tuturuuu): Implement transaction details page.
      onPressed: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isExpense
                    ? colorScheme.destructive.withValues(alpha: 0.12)
                    : colorScheme.primary.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                isExpense ? Icons.arrow_downward : Icons.arrow_upward,
                size: 16,
                color: isExpense
                    ? colorScheme.destructive
                    : colorScheme.primary,
              ),
            ),
            const shad.Gap(16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p,
                  ),
                  if (subtitle.isNotEmpty)
                    Text(
                      subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textMuted,
                    ),
                ],
              ),
            ),
            Text(
              formatCurrency(amount, currency),
              style: theme.typography.p.copyWith(
                fontWeight: FontWeight.w600,
                color: isExpense
                    ? colorScheme.destructive
                    : colorScheme.primary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
