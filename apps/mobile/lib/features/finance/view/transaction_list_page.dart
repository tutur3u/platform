import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold, TextField;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/transaction_list_cubit.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/finance/widgets/grouped_transaction_accordion.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
    final exchangeRates = context
        .read<TransactionListCubit>()
        .state
        .exchangeRates;

    final created = await openCreateTransactionSheet(
      context,
      wsId: wsId,
      repository: context.read<FinanceRepository>(),
      exchangeRates: exchangeRates,
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

                  final repository = context.read<FinanceRepository>();
                  return RefreshIndicator(
                    onRefresh: _onRefresh,
                    child: GroupedTransactionAccordion(
                      lazy: true,
                      scrollController: _scrollController,
                      listPadding: const EdgeInsets.only(top: 8, bottom: 40),
                      transactions: state.transactions,
                      workspaceCurrency: state.workspaceCurrency,
                      exchangeRates: state.exchangeRates,
                      showLoadingMore: state.isLoadingMore,
                      onTransactionTap: (transaction) async {
                        final wsId = context
                            .read<WorkspaceCubit>()
                            .state
                            .currentWorkspace
                            ?.id;
                        if (wsId == null) return;

                        final changed = await openTransactionDetailSheet(
                          context,
                          wsId: wsId,
                          transaction: transaction,
                          repository: repository,
                          workspaceCurrency: state.workspaceCurrency,
                          exchangeRates: state.exchangeRates,
                        );

                        if (!context.mounted || !changed) return;
                        await _onRefresh();
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
