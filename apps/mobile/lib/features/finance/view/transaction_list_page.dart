import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/grouped_transaction_accordion.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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

class TransactionListPage extends StatelessWidget {
  const TransactionListPage({super.key});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
      child: BlocProvider(
        create: (context) {
          final cubit = TransactionListCubit(
            financeRepository: context.read<FinanceRepository>(),
          );
          unawaited(_loadFromWorkspace(context, cubit));
          return cubit;
        },
        child: const _TransactionListView(),
      ),
    );
  }
}

class _TransactionListView extends StatefulWidget {
  const _TransactionListView();

  @override
  State<_TransactionListView> createState() => _TransactionListViewState();
}

class _TransactionListViewState extends State<_TransactionListView> {
  static const double _fabContentBottomPadding = 96;

  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  Timer? _debounce;
  bool _isSearchVisible = false;

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
    await _loadFromWorkspace(
      context,
      context.read<TransactionListCubit>(),
      forceRefresh: true,
    );
  }

  void _onScroll() {
    if (!_scrollController.hasClients) {
      return;
    }
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
    if (wsId == null) {
      return;
    }

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final state = context.read<TransactionListCubit>().state;
    final created = await openCreateTransactionSheet(
      context,
      wsId: wsId,
      repository: context.read<FinanceRepository>(),
      exchangeRates: state.exchangeRates,
    );

    if (!mounted || !created) {
      return;
    }

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

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final listBottomPadding =
        _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, _) => unawaited(_onRefresh()),
        child: Stack(
          children: [
            BlocBuilder<TransactionListCubit, TransactionListState>(
              builder: (context, state) {
                if (_searchController.text != state.search &&
                    _searchController.text.isEmpty &&
                    state.search.isNotEmpty) {
                  _searchController.text = state.search;
                }

                if (state.status == TransactionListStatus.loading &&
                    state.transactions.isEmpty) {
                  return const Center(child: shad.CircularProgressIndicator());
                }

                if (state.status == TransactionListStatus.error &&
                    state.transactions.isEmpty) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: EdgeInsets.fromLTRB(16, 12, 16, listBottomPadding),
                    children: [
                      FinanceEmptyState(
                        icon: Icons.error_outline,
                        title: l10n.commonSomethingWentWrong,
                        body: state.error ?? l10n.financeTransactions,
                        action: shad.SecondaryButton(
                          onPressed: _onRefresh,
                          child: Text(l10n.commonRetry),
                        ),
                      ),
                    ],
                  );
                }

                if (state.transactions.isEmpty) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: EdgeInsets.fromLTRB(16, 12, 16, listBottomPadding),
                    children: [
                      _ActivityHeaderCard(
                        searchController: _searchController,
                        onChanged: _onSearchChanged,
                        isSearchVisible: _isSearchVisible,
                        state: state,
                        onToggleSearch: () => setState(
                          () => _isSearchVisible = !_isSearchVisible,
                        ),
                      ),
                      const shad.Gap(14),
                      FinanceEmptyState(
                        icon: state.search.isNotEmpty
                            ? Icons.search_off_rounded
                            : Icons.receipt_long_outlined,
                        title: state.search.isNotEmpty
                            ? l10n.financeNoSearchResults
                            : l10n.financeNoTransactions,
                        body: state.search.isNotEmpty
                            ? l10n.financeActivitySearchEmptyBody
                            : l10n.financeOverviewNoTransactionsBody,
                        action: state.search.isNotEmpty
                            ? shad.SecondaryButton(
                                onPressed: () {
                                  _searchController.clear();
                                  _onSearchChanged('');
                                },
                                child: Text(l10n.financeActivityClearSearch),
                              )
                            : shad.SecondaryButton(
                                onPressed: _onCreateTransaction,
                                child: Text(l10n.financeAddFirstTransaction),
                              ),
                      ),
                    ],
                  );
                }

                final repository = context.read<FinanceRepository>();
                return RefreshIndicator(
                  onRefresh: _onRefresh,
                  child: GroupedTransactionAccordion(
                    lazy: true,
                    scrollController: _scrollController,
                    listPadding: EdgeInsets.only(
                      left: 16,
                      top: 12,
                      right: 16,
                      bottom: listBottomPadding,
                    ),
                    transactions: state.transactions,
                    workspaceCurrency: state.workspaceCurrency,
                    exchangeRates: state.exchangeRates,
                    showLoadingMore: state.isLoadingMore,
                    headerChildren: [
                      _ActivityHeaderCard(
                        searchController: _searchController,
                        onChanged: _onSearchChanged,
                        isSearchVisible: _isSearchVisible,
                        state: state,
                        onToggleSearch: () => setState(
                          () => _isSearchVisible = !_isSearchVisible,
                        ),
                      ),
                    ],
                    onTransactionTap: (transaction) async {
                      final wsId = context
                          .read<WorkspaceCubit>()
                          .state
                          .currentWorkspace
                          ?.id;
                      if (wsId == null) {
                        return;
                      }

                      final changed = await openTransactionDetailSheet(
                        context,
                        wsId: wsId,
                        transaction: transaction,
                        repository: repository,
                        workspaceCurrency: state.workspaceCurrency,
                        exchangeRates: state.exchangeRates,
                      );

                      if (!context.mounted || !changed) {
                        return;
                      }

                      await _onRefresh();
                    },
                  ),
                );
              },
            ),
            ExtendedFab(
              icon: Icons.add,
              label: l10n.financeCreateTransaction,
              onPressed: _onCreateTransaction,
            ),
          ],
        ),
      ),
    );
  }
}

class _ActivityHeaderCard extends StatelessWidget {
  const _ActivityHeaderCard({
    required this.searchController,
    required this.onChanged,
    required this.isSearchVisible,
    required this.state,
    required this.onToggleSearch,
  });

  final TextEditingController searchController;
  final ValueChanged<String> onChanged;
  final bool isSearchVisible;
  final TransactionListState state;
  final VoidCallback onToggleSearch;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return FinancePanel(
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          FinanceSectionHeader(
            title: l10n.financeOverviewActivityTitle,
            subtitle: state.search.isNotEmpty
                ? l10n.financeActivitySearchResults(state.transactions.length)
                : (isSearchVisible
                      ? l10n.financeActivitySearchHint
                      : l10n.financeActivityDefaultHint),
            action: shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: onToggleSearch,
              child: Icon(
                isSearchVisible ? Icons.close_rounded : Icons.search_rounded,
                size: 18,
              ),
            ),
          ),
          if (isSearchVisible) ...[
            const shad.Gap(14),
            shad.TextField(
              controller: searchController,
              hintText: l10n.financeSearchTransactions,
              onChanged: onChanged,
              features: [
                const shad.InputFeature.leading(
                  Icon(Icons.search_rounded, size: 18),
                ),
                if (state.search.isNotEmpty)
                  shad.InputFeature.trailing(
                    shad.IconButton.ghost(
                      onPressed: () {
                        searchController.clear();
                        onChanged('');
                      },
                      icon: const Icon(Icons.close_rounded, size: 16),
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
