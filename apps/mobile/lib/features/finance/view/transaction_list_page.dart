import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_query.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/finance/view/transaction_list_body.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> _loadFromWorkspace(
  BuildContext context,
  TransactionListCubit cubit, {
  bool forceRefresh = false,
}) async {
  final ws = context.read<WorkspaceCubit>().state.currentWorkspace;
  if (ws == null) {
    return;
  }
  await cubit.load(ws.id, forceRefresh: forceRefresh);
}

/// Transactions: kind, month, wallet and category filters, their In/Out
/// totals, and every matching transaction grouped by day. It opens on the
/// current month.
class TransactionListPage extends StatelessWidget {
  const TransactionListPage({
    this.initialTransactionId,
    this.startInSearch = false,
    this.repository,
    this.now,
    super.key,
  });

  final bool startInSearch;

  final String? initialTransactionId;

  /// Injected in tests; the page builds its own otherwise.
  final FinanceRepository? repository;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => repository ?? FinanceRepository(),
      child: BlocProvider(
        create: (context) {
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          final month = FinanceTransactionQuery.month(now ?? DateTime.now());
          final cubit = TransactionListCubit(
            financeRepository: context.read<FinanceRepository>(),
            initialState: TransactionListState(query: month),
          );
          if (wsId != null) unawaited(_loadFromWorkspace(context, cubit));
          return cubit;
        },
        child: _TransactionListView(
          initialTransactionId: initialTransactionId,
          startInSearch: startInSearch,
          now: now,
        ),
      ),
    );
  }
}

class _TransactionListView extends StatefulWidget {
  const _TransactionListView({
    required this.startInSearch,
    this.initialTransactionId,
    this.now,
  });

  final bool startInSearch;
  final String? initialTransactionId;
  final DateTime? now;

  @override
  State<_TransactionListView> createState() => _TransactionListViewState();
}

class _TransactionListViewState extends State<_TransactionListView> {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  Timer? _debounce;
  bool _isSearchVisible = false;

  @override
  void initState() {
    super.initState();
    _isSearchVisible = widget.startInSearch;
    _scrollController.addListener(_onScroll);
    if (widget.initialTransactionId != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) unawaited(_openInitialTransaction());
      });
    }
  }

  Future<void> _openInitialTransaction() async {
    final transactionId = widget.initialTransactionId;
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (transactionId == null || wsId == null) return;
    final repository = context.read<FinanceRepository>();
    final state = context.read<TransactionListCubit>().state;
    final cached = state.transactions
        .where((transaction) => transaction.id == transactionId)
        .firstOrNull;
    final transaction =
        cached ??
        await repository.getTransactionById(
          wsId: wsId,
          transactionId: transactionId,
        );
    if (!mounted ||
        transaction == null ||
        context.read<WorkspaceCubit>().state.currentWorkspace?.id != wsId) {
      return;
    }
    await _openTransaction(transaction);
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

  Future<void> _onRefresh() => _loadFromWorkspace(
    context,
    context.read<TransactionListCubit>(),
    forceRefresh: true,
  );

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 240) {
      unawaited(context.read<TransactionListCubit>().loadMore());
    }
  }

  void _onSearchChanged(String query) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      unawaited(context.read<TransactionListCubit>().setSearch(query));
    });
  }

  void _closeSearch() {
    _debounce?.cancel();
    _searchController.clear();
    unawaited(context.read<TransactionListCubit>().setSearch(''));
    setState(() => _isSearchVisible = false);
  }

  Future<void> _openTransaction(Transaction transaction) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final state = context.read<TransactionListCubit>().state;
    await openTransactionDetailSheet(
      context,
      wsId: wsId,
      transaction: transaction,
      repository: context.read<FinanceRepository>(),
      workspaceCurrency: state.workspaceCurrency,
      exchangeRates: state.exchangeRates,
    );
    if (mounted) await _onRefresh();
  }

  Future<void> _onCreateTransaction() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final state = context.read<TransactionListCubit>().state;
    final created = await openCreateTransactionSheet(
      context,
      wsId: wsId,
      repository: context.read<FinanceRepository>(),
      exchangeRates: state.exchangeRates,
      initialWalletId: state.walletId,
    );
    if (!mounted || !created) return;
    showAppToast(context, message: context.l10n.financeTransactionSaved);
    await _onRefresh();
  }

  void _clearFilters() {
    _debounce?.cancel();
    _searchController.clear();
    unawaited(
      context.read<TransactionListCubit>().setFilters(
        query: const FinanceTransactionQuery(),
        walletId: null,
        clearSearch: true,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final showAmounts = financeAmountsVisible(context);
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, _) => unawaited(_onRefresh()),
      child: Stack(
        fit: StackFit.expand,
        children: [
          ShellTitleOverride(
            ownerId: 'finance-transactions',
            locations: const {Routes.transactions},
            title: l10n.financeTransactions,
            showLeadingBrand: false,
            showAvatar: false,
          ),
          ShellChromeActions(
            ownerId: 'finance-transactions',
            locations: const {Routes.transactions},
            actions: [
              ShellActionSpec.search(
                id: 'finance-transactions-search',
                active: _isSearchVisible,
                tooltip: _isSearchVisible
                    ? l10n.financeActivityClearSearch
                    : l10n.financeSearchTransactions,
                controller: _searchController,
                searchHint: l10n.financeSearchTransactions,
                onSearchChanged: _onSearchChanged,
                onCloseSearch: _closeSearch,
                onPressed: () {
                  if (_isSearchVisible) {
                    _closeSearch();
                  } else {
                    setState(() => _isSearchVisible = true);
                  }
                },
              ),
              financeAmountVisibilityAction(
                context,
                showAmounts: showAmounts,
                id: 'finance-transactions-amount-visibility',
              ),
              ShellActionSpec(
                id: 'finance-transactions-create',
                icon: AppIcons.add,
                tooltip: l10n.financeNewTransaction,
                filled: true,
                onPressed: () => unawaited(_onCreateTransaction()),
              ),
            ],
          ),
          BlocBuilder<TransactionListCubit, TransactionListState>(
            builder: (context, state) => TransactionListBody(
              state: state,
              controller: _scrollController,
              workspaceId: context
                  .read<WorkspaceCubit>()
                  .state
                  .currentWorkspace
                  ?.id,
              now: widget.now,
              onRefresh: _onRefresh,
              onTransactionTap: (transaction) =>
                  unawaited(_openTransaction(transaction)),
              onFiltersChanged: (query, walletId) => unawaited(
                context.read<TransactionListCubit>().setFilters(
                  query: query,
                  walletId: walletId,
                ),
              ),
              onClearFilters: _clearFilters,
              onLoadMore: () =>
                  unawaited(context.read<TransactionListCubit>().loadMore()),
              onCreate: () => unawaited(_onCreateTransaction()),
            ),
          ),
        ],
      ),
    );
  }
}
