import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/utils/finance_period.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/finance/view/wallet_detail_body.dart';
import 'package:mobile/features/finance/view/wallet_detail_widgets.dart';
import 'package:mobile/features/finance/view/wallet_interest_sheet.dart';
import 'package:mobile/features/finance/view/wallet_reconciliation_panel.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/finance/widgets/wallet_dialog.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Rows fetched per page; a period that fits in one page draws its chart.
const walletDetailPageSize = 100;

/// One wallet: balance card, a pinned period switcher, the period's
/// income, expense and net with a daily chart, and its transactions grouped
/// by day. Adding a transaction to the wallet is the dock's primary action.
class WalletDetailPage extends StatelessWidget {
  const WalletDetailPage({
    required this.walletId,
    this.repository,
    this.now,
    super.key,
  });

  final FinanceRepository? repository;
  final String walletId;

  /// Reference time for the opening period and day labels; defaults to now.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => repository ?? FinanceRepository(),
      child: _WalletDetailView(walletId: walletId, now: now),
    );
  }
}

class _WalletDetailView extends StatefulWidget {
  const _WalletDetailView({required this.walletId, this.now});

  final String walletId;
  final DateTime? now;

  @override
  State<_WalletDetailView> createState() => _WalletDetailViewState();
}

class _WalletDetailViewState extends State<_WalletDetailView> {
  final _scrollController = ScrollController();
  late FinancePeriod _period = FinancePeriod.containing(
    FinancePeriodKind.month,
    _now,
  );

  Wallet? _wallet;
  bool _walletMissing = false;
  String _workspaceCurrency = '';
  List<ExchangeRate> _exchangeRates = const [];

  /// Period the stats and rows below belong to; null before the first load.
  FinancePeriod? _loadedPeriod;
  TransactionStats? _stats;
  List<Transaction> _transactions = const [];
  String? _cursor;
  bool _hasMore = false;
  bool _loadingMore = false;
  String? _error;
  int _generation = 0;

  DateTime get _now => widget.now ?? DateTime.now();

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    unawaited(_load());
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_onScroll)
      ..dispose();
    super.dispose();
  }

  bool _isCurrent(int generation, String wsId) =>
      mounted && generation == _generation && _wsId == wsId;

  void _reset() {
    _wallet = null;
    _walletMissing = false;
    _loadedPeriod = null;
    _stats = null;
    _transactions = const [];
    _cursor = null;
    _hasMore = false;
    _error = null;
  }

  Future<void> _load() async {
    final wsId = _wsId;
    final generation = ++_generation;
    if (wsId == null) {
      setState(_reset);
      return;
    }
    setState(() {
      _error = null;
      _loadingMore = false;
    });
    try {
      await CacheStore.readWithRevalidation(
        () => _fetch(wsId, _period, generation),
        onSnapshot: (_) {},
      );
    } on Object catch (error) {
      if (!_isCurrent(generation, wsId)) return;
      final message = error is ApiException ? error.message.trim() : '';
      setState(
        () => _error = message.isEmpty
            ? context.l10n.commonSomethingWentWrong
            : message,
      );
    }
  }

  Future<void> _fetch(String wsId, FinancePeriod period, int generation) async {
    final repository = context.read<FinanceRepository>();
    final wallet = await repository.getWalletById(
      wsId: wsId,
      walletId: widget.walletId,
    );
    if (!_isCurrent(generation, wsId)) return;
    if (wallet == null) {
      setState(() {
        _reset();
        _walletMissing = true;
      });
      return;
    }
    // The balance card shows while the period's figures load.
    setState(() => _wallet = wallet);
    final (currency, rates, stats, page) = await (
      repository.getWorkspaceDefaultCurrency(wsId),
      repository.getExchangeRates().catchError((_) => const <ExchangeRate>[]),
      repository
          .getTransactionStats(
            wsId: wsId,
            walletId: widget.walletId,
            filters: period.query,
          )
          .then<TransactionStats?>((value) => value)
          .catchError((_) => null),
      repository.getTransactionsInfinite(
        wsId: wsId,
        walletId: widget.walletId,
        query: period.query,
        limit: walletDetailPageSize,
      ),
    ).wait;
    if (!_isCurrent(generation, wsId)) return;
    setState(() {
      _workspaceCurrency = currency;
      _exchangeRates = rates;
      _loadedPeriod = period;
      _stats = stats;
      _transactions = collapseTransferTransactions(page.data);
      _cursor = page.nextCursor;
      _hasMore = page.hasMore;
      _error = null;
    });
  }

  void _onScroll() {
    if (!_scrollController.hasClients) return;
    final position = _scrollController.position;
    if (position.pixels >= position.maxScrollExtent - 240) {
      unawaited(_loadMore());
    }
  }

  Future<void> _loadMore() async {
    final wsId = _wsId;
    final cursor = _cursor;
    final period = _loadedPeriod;
    if (wsId == null || cursor == null || period == null) return;
    if (!_hasMore || _loadingMore) return;
    final generation = _generation;
    setState(() => _loadingMore = true);
    try {
      final page = await context
          .read<FinanceRepository>()
          .getTransactionsInfinite(
            wsId: wsId,
            walletId: widget.walletId,
            cursor: cursor,
            query: period.query,
            limit: walletDetailPageSize,
          );
      if (!_isCurrent(generation, wsId)) return;
      setState(() {
        _transactions = collapseTransferTransactions([
          ..._transactions,
          ...page.data,
        ]);
        _cursor = page.nextCursor;
        _hasMore = page.hasMore;
      });
    } on Object {
      if (_isCurrent(generation, wsId)) setState(() => _hasMore = false);
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loadingMore = false);
      }
    }
  }

  void _setPeriod(FinancePeriod period) {
    if (period == _period) return;
    setState(() => _period = period);
    unawaited(_load());
  }

  Future<void> _create({bool transfer = false}) async {
    final wsId = _wsId;
    final wallet = _wallet;
    if (wsId == null || wallet == null) return;
    final created = await openCreateTransactionSheet(
      context,
      wsId: wsId,
      repository: context.read<FinanceRepository>(),
      exchangeRates: _exchangeRates,
      initialWalletId: wallet.id,
      initialTransfer: transfer,
    );
    if (!mounted || !created) return;
    showAppToast(context, message: context.l10n.financeTransactionSaved);
    await _load();
  }

  Future<void> _edit() async {
    final wallet = _wallet;
    final wsId = _wsId;
    if (wallet == null || wsId == null) return;
    final changed = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => WalletDialog(
        wsId: wsId,
        wallet: wallet,
        repository: context.read<FinanceRepository>(),
      ),
    );
    if (mounted && changed == true) await _load();
  }

  Future<void> _openTransaction(Transaction transaction) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final changed = await openTransactionDetailSheet(
      context,
      wsId: wsId,
      transaction: transaction,
      repository: context.read<FinanceRepository>(),
      workspaceCurrency: _workspaceCurrency,
      exchangeRates: _exchangeRates,
    );
    if (mounted && changed && _wsId == wsId) await _load();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final wallet = _wallet;
    final location = Routes.walletDetailPath(widget.walletId);
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, _) {
        setState(_reset);
        unawaited(_load());
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          ShellTitleOverride(
            ownerId: 'finance-wallet-detail',
            locations: {location},
            title: wallet?.name ?? l10n.financeWallet,
            showLeadingBrand: false,
            showAvatar: false,
          ),
          ShellChromeActions(
            ownerId: 'finance-wallet-detail',
            locations: {location},
            actions: [
              financeAmountVisibilityAction(
                context,
                showAmounts: financeAmountsVisible(context),
              ),
              if (wallet != null &&
                  _workspaceCurrency.isNotEmpty &&
                  canManageFinance(context, 'view_transactions'))
                ShellActionSpec(
                  id: 'finance-wallet-interest',
                  icon: LucideIcons.trendingUp,
                  tooltip: l10n.financeWalletInterest,
                  onPressed: () => unawaited(
                    showWalletInterest(
                      context,
                      wallet: wallet.id,
                      currency: (wallet.currency ?? _workspaceCurrency)
                          .toUpperCase(),
                    ),
                  ),
                ),
              if (canManageFinance(context, 'create_transactions'))
                financeCreateAction(
                  id: 'finance-wallet-create-transaction',
                  tooltip: l10n.financeCreateTransaction,
                  onPressed: wallet == null ? null : () => unawaited(_create()),
                ),
            ],
          ),
          NovaRefreshIndicator(onRefresh: _load, child: _body(wallet)),
        ],
      ),
    );
  }

  Widget _body(Wallet? wallet) {
    final l10n = context.l10n;
    if (wallet == null) {
      if (_walletMissing || _error != null) {
        return FinanceProblemView(
          problem: FinanceProblem.error,
          message: _walletMissing ? l10n.financeWalletNotFound : _error,
          onRetry: () => unawaited(_load()),
        );
      }
      return const WalletDetailSkeleton();
    }
    final loaded = _loadedPeriod == _period;
    return WalletDetailBody(
      controller: _scrollController,
      hero: WalletBalanceHero(
        wallet: wallet,
        workspaceCurrency: _workspaceCurrency,
        exchangeRates: _exchangeRates,
        onTransfer: canManageFinance(context, 'create_transactions')
            ? () => unawaited(_create(transfer: true))
            : null,
        onEdit: canManageFinance(context, 'update_wallets')
            ? () => unawaited(_edit())
            : null,
      ),
      checkpointHistory: WalletReconciliationPanel(
        wallet: wallet,
        currency: (wallet.currency ?? _workspaceCurrency).toUpperCase(),
        revision: _generation,
        onAdjustment: _load,
      ),
      period: _period,
      now: _now,
      onPeriodChanged: _setPeriod,
      currency: (wallet.currency ?? _workspaceCurrency).toUpperCase(),
      stats: loaded ? _stats : null,
      transactions: loaded ? _transactions : null,
      complete: loaded && !_hasMore,
      loadingMore: _loadingMore,
      error: loaded ? null : _error,
      onRetry: () => unawaited(_load()),
      onTransactionTap: (transaction) =>
          unawaited(_openTransaction(transaction)),
      onCreate: canManageFinance(context, 'create_transactions')
          ? () => unawaited(_create())
          : null,
    );
  }
}
