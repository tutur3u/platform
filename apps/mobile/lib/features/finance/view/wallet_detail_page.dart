import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/finance/view/wallet_detail_widgets.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/grouped_transaction_accordion.dart';
import 'package:mobile/features/finance/widgets/wallet_dialog.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/fab/extended_fab.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WalletDetailPage extends StatelessWidget {
  const WalletDetailPage({required this.walletId, super.key});

  final String walletId;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
      child: _WalletDetailView(walletId: walletId),
    );
  }
}

class _WalletDetailView extends StatefulWidget {
  const _WalletDetailView({required this.walletId});

  final String walletId;

  @override
  State<_WalletDetailView> createState() => _WalletDetailViewState();
}

class _WalletDetailViewState extends State<_WalletDetailView> {
  static const double _fabContentBottomPadding = 96;

  final ScrollController _scrollController = ScrollController();

  Wallet? _wallet;
  TransactionStats? _stats;
  List<Transaction> _transactions = const [];
  List<ExchangeRate> _exchangeRates = const [];
  String _workspaceCurrency = 'USD';
  String? _nextCursor;
  bool _hasMore = true;
  bool _isLoadingInitial = false;
  bool _isLoadingMore = false;
  String? _error;
  int _requestToken = 0;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    unawaited(_loadInitial());
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final showAmounts = context.select<FinancePreferencesCubit, bool>(
      (cubit) => cubit.state.showAmounts,
    );
    final listBottomPadding =
        _fabContentBottomPadding + MediaQuery.paddingOf(context).bottom;
    final wallet = _wallet;

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, _) => unawaited(_loadInitial()),
        child: Stack(
          children: [
            FinanceAmountVisibilityShellAction(
              ownerId: 'finance-wallet-detail-amount-visibility',
              locations: {Routes.walletDetailPath(widget.walletId)},
            ),
            Column(
              children: [
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _onRefresh,
                    child: _isLoadingInitial && wallet == null
                        ? const Center(
                            child: shad.CircularProgressIndicator(),
                          )
                        : _error != null
                        ? ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: [
                              const SizedBox(height: 120),
                              Center(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 24,
                                  ),
                                  child: Text(
                                    _error!,
                                    textAlign: TextAlign.center,
                                  ),
                                ),
                              ),
                            ],
                          )
                        : wallet == null
                        ? ListView(
                            physics: const AlwaysScrollableScrollPhysics(),
                            children: [
                              const SizedBox(height: 120),
                              Center(
                                child: Text(
                                  l10n.financeWalletNotFound,
                                ),
                              ),
                            ],
                          )
                        : GroupedTransactionAccordion(
                            transactions: _transactions,
                            workspaceCurrency: _workspaceCurrency,
                            exchangeRates: _exchangeRates,
                            showLoadingMore: _isLoadingMore,
                            showAmounts: showAmounts,
                            compactHorizontalPadding: 0,
                            lazy: true,
                            usePanelChrome: false,
                            emphasizeTransactionRows: true,
                            collapseBreakdownByDefault: true,
                            scrollController: _scrollController,
                            listPadding: EdgeInsets.fromLTRB(
                              16,
                              12,
                              16,
                              listBottomPadding,
                            ),
                            headerChildren: [
                              WalletDetailSummaryCard(
                                wallet: wallet,
                                stats: _stats,
                                workspaceCurrency: _workspaceCurrency,
                                exchangeRates: _exchangeRates,
                                showAmounts: showAmounts,
                                onEdit: _isLoadingInitial
                                    ? null
                                    : _onEditWallet,
                              ),
                              const shad.Gap(12),
                            ],
                            emptyState: FinanceEmptyState(
                              icon: Icons.receipt_long_outlined,
                              title: l10n.financeNoTransactions,
                              body: l10n.financeOverviewNoTransactionsBody,
                              action: shad.SecondaryButton(
                                onPressed: _onCreateTransaction,
                                child: Text(l10n.financeAddFirstTransaction),
                              ),
                            ),
                            onTransactionTap: _openTransaction,
                          ),
                  ),
                ),
              ],
            ),
            if (wallet != null && !_isLoadingInitial)
              ExtendedFab(
                icon: Icons.add,
                label: context.l10n.financeCreateTransaction,
                includeBottomSafeArea: false,
                onPressed: _onCreateTransaction,
              ),
          ],
        ),
      ),
    );
  }

  void _onScroll() {
    if (!_scrollController.hasClients || _isLoadingMore || !_hasMore) {
      return;
    }

    final maxScroll = _scrollController.position.maxScrollExtent;
    final currentScroll = _scrollController.offset;
    if (currentScroll >= maxScroll - 180) {
      unawaited(_loadMore());
    }
  }

  Future<void> _onRefresh() async {
    await _loadInitial(showLoader: false);
  }

  Future<void> _loadInitial({bool showLoader = true}) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final requestToken = ++_requestToken;
    final repository = context.read<FinanceRepository>();

    if (showLoader) {
      setState(() {
        _isLoadingInitial = true;
        _isLoadingMore = false;
        _error = null;
      });
    }

    try {
      final walletFuture = repository.getWalletById(
        wsId: wsId,
        walletId: widget.walletId,
      );
      final wallet = await walletFuture;
      if (!mounted || requestToken != _requestToken) return;
      if (wallet == null) {
        setState(() {
          _wallet = null;
          _stats = null;
          _transactions = const [];
          _exchangeRates = const [];
          _nextCursor = null;
          _hasMore = false;
          _error = null;
        });
        return;
      }

      final workspaceCurrencyFuture = repository
          .getWorkspaceDefaultCurrency(wsId)
          .catchError((_) => 'USD');
      final exchangeRatesFuture = repository.getExchangeRates().catchError(
        (_) => const <ExchangeRate>[],
      );
      final statsFuture = repository
          .getTransactionStats(wsId: wsId, walletId: widget.walletId)
          .then<TransactionStats?>((value) => value)
          .catchError((_) => null);
      final transactionsFuture = repository.getTransactionsInfinite(
        wsId: wsId,
        walletId: widget.walletId,
      );

      final workspaceCurrency = await workspaceCurrencyFuture;
      final exchangeRates = await exchangeRatesFuture;
      final stats = await statsFuture;
      final firstPage = await transactionsFuture;

      if (!mounted || requestToken != _requestToken) return;

      setState(() {
        _wallet = wallet;
        _workspaceCurrency = workspaceCurrency;
        _exchangeRates = exchangeRates;
        _stats = _normalizeStatsCurrency(stats, wallet.currency);
        _transactions = collapseTransferTransactions(firstPage.data);
        _hasMore = firstPage.hasMore;
        _nextCursor = firstPage.nextCursor;
        _error = null;
      });
    } on ApiException catch (e) {
      if (!mounted || requestToken != _requestToken) return;
      final commonSomethingWentWrong = context.l10n.commonSomethingWentWrong;
      setState(
        () => _error = e.message.isNotEmpty
            ? e.message
            : commonSomethingWentWrong,
      );
    } on Exception {
      if (!mounted || requestToken != _requestToken) return;
      setState(() => _error = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted && requestToken == _requestToken) {
        setState(() => _isLoadingInitial = false);
      }
    }
  }

  Future<void> _loadMore() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final nextCursor = _nextCursor;
    final requestToken = _requestToken;
    if (wsId == null || nextCursor == null || !_hasMore || _isLoadingInitial) {
      return;
    }

    setState(() => _isLoadingMore = true);

    try {
      final page = await context
          .read<FinanceRepository>()
          .getTransactionsInfinite(
            wsId: wsId,
            walletId: widget.walletId,
            cursor: nextCursor,
          );

      if (!mounted || requestToken != _requestToken) {
        if (mounted && _isLoadingMore) {
          setState(() => _isLoadingMore = false);
        }
        return;
      }
      setState(() {
        _transactions = collapseTransferTransactions([
          ..._transactions,
          ...page.data,
        ]);
        _hasMore = page.hasMore;
        _nextCursor = page.nextCursor;
      });
    } on Exception {
      if (!mounted || requestToken != _requestToken) {
        if (mounted && _isLoadingMore) {
          setState(() => _isLoadingMore = false);
        }
        return;
      }
      setState(() => _hasMore = false);
    } finally {
      if (mounted && _isLoadingMore) {
        setState(() => _isLoadingMore = false);
      }
    }
  }

  Future<void> _onEditWallet() async {
    final wallet = _wallet;
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wallet == null || wsId == null) return;

    final changed = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => WalletDialog(
        wsId: wsId,
        wallet: wallet,
        repository: context.read<FinanceRepository>(),
      ),
    );

    if (!mounted || changed != true) return;
    await _loadInitial(showLoader: false);
  }

  Future<void> _onCreateTransaction() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    final wallet = _wallet;
    if (wsId == null || wallet == null) return;

    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final created = await openCreateTransactionSheet(
      context,
      wsId: wsId,
      repository: context.read<FinanceRepository>(),
      exchangeRates: _exchangeRates,
      initialWalletId: wallet.id,
    );

    if (!mounted || !created) return;
    await _loadInitial(showLoader: false);

    if (toastContext.mounted) {
      shad.showToast(
        context: toastContext,
        builder: (ctx, _) => shad.Alert(
          content: Text(ctx.l10n.financeTransactionCreated),
        ),
      );
    }
  }

  Future<void> _openTransaction(Transaction transaction) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final changed = await openTransactionDetailSheet(
      context,
      wsId: wsId,
      transaction: transaction,
      repository: context.read<FinanceRepository>(),
      workspaceCurrency: _workspaceCurrency,
      exchangeRates: _exchangeRates,
    );

    if (!mounted || !changed) return;
    await _loadInitial(showLoader: false);
  }

  TransactionStats? _normalizeStatsCurrency(
    TransactionStats? stats,
    String? fallbackSourceCurrency,
  ) {
    if (stats == null) return null;

    final sourceCurrency = (stats.currency ?? fallbackSourceCurrency)
        ?.trim()
        .toUpperCase();

    if (sourceCurrency == null || sourceCurrency.isEmpty) {
      return stats;
    }

    return stats.copyWith(currency: sourceCurrency);
  }
}
