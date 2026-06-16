import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_checkpoint_sheets.dart';
import 'package:mobile/features/finance/widgets/wallet_checkpoint_ui.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class FinanceCheckpointsPage extends StatelessWidget {
  const FinanceCheckpointsPage({this.initialWalletId, super.key});

  final String? initialWalletId;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
      child: _FinanceCheckpointsView(initialWalletId: initialWalletId),
    );
  }
}

class _FinanceCheckpointsView extends StatefulWidget {
  const _FinanceCheckpointsView({this.initialWalletId});

  final String? initialWalletId;

  @override
  State<_FinanceCheckpointsView> createState() =>
      _FinanceCheckpointsViewState();
}

class _FinanceCheckpointsViewState extends State<_FinanceCheckpointsView> {
  static const double _bottomPadding = 28;

  WalletCheckpointSummaryResponse? _summary;
  WalletCheckpointListResponse? _selectedWalletCheckpoints;
  List<TransactionCategory> _categories = const [];
  String? _selectedWalletId;
  String? _error;
  bool _isLoadingSummary = false;
  bool _isLoadingWallet = false;
  bool _isMutating = false;
  int _requestToken = 0;

  @override
  void initState() {
    super.initState();
    _selectedWalletId = widget.initialWalletId;
    unawaited(_load());
  }

  @override
  Widget build(BuildContext context) {
    final showAmounts = context.select<FinancePreferencesCubit, bool>(
      (cubit) => cubit.state.showAmounts,
    );
    final summary = _summary;
    final selectedWallet = _selectedWallet;

    return shad.Scaffold(
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, _) => unawaited(_load()),
        child: Stack(
          children: [
            const FinanceAmountVisibilityShellAction(
              ownerId: 'finance-checkpoints-amount-visibility',
              locations: {Routes.financeCheckpoints},
            ),
            if (_isLoadingSummary && summary == null)
              const Center(child: NovaLoadingIndicator())
            else if (_error != null && summary == null)
              _CheckpointError(error: _error, onRetry: _load)
            else if (summary == null || summary.wallets.isEmpty)
              _CheckpointEmpty(onBatchCheck: _openBatchSheet)
            else
              RefreshIndicator(
                onRefresh: () => _load(showLoader: false),
                child: ListView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    10,
                    16,
                    _bottomPadding + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: [
                    FinanceCheckpointTotalsPanel(
                      totals: summary.totalsByCurrency,
                      showAmounts: showAmounts,
                      onBatchCheck: _isMutating ? () {} : _openBatchSheet,
                    ),
                    const shad.Gap(22),
                    WalletCheckpointSelector(
                      wallets: summary.wallets,
                      selectedWalletId: _selectedWalletId,
                      latestByWalletId: _latestByWalletId,
                      onSelected: _selectWallet,
                    ),
                    const shad.Gap(22),
                    if (_isLoadingWallet && _selectedWalletCheckpoints == null)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 48),
                        child: Center(child: NovaLoadingIndicator()),
                      )
                    else if (selectedWallet != null &&
                        _selectedWalletCheckpoints != null)
                      WalletCheckpointDetailSections(
                        wallet: selectedWallet,
                        response: _selectedWalletCheckpoints!,
                        showAmounts: showAmounts,
                        canMutate: !_isMutating,
                        onCreate: () => _openCheckpointSheet(selectedWallet),
                        onEdit: (checkpoint) => _openCheckpointSheet(
                          selectedWallet,
                          checkpoint: checkpoint,
                        ),
                        onDelete: _openDeleteSheet,
                        onReconcile: (interval) =>
                            _openReconciliationSheet(selectedWallet, interval),
                      )
                    else
                      FinanceEmptyState(
                        icon: Icons.fact_check_outlined,
                        title: context.l10n.financeCheckpointsNoCheckpoint,
                        body: context.l10n.financeCheckpointsNoCheckpointDetail,
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }

  Wallet? get _selectedWallet {
    final selectedId = _selectedWalletId;
    final wallets = _summary?.wallets ?? const <Wallet>[];
    if (selectedId == null) return wallets.firstOrNull;
    return wallets.where((wallet) => wallet.id == selectedId).firstOrNull;
  }

  Map<String, WalletCheckpoint> get _latestByWalletId => {
    for (final checkpoint
        in _summary?.latestCheckpoints ?? const <WalletCheckpoint>[])
      checkpoint.walletId: checkpoint,
  };

  Future<void> _load({bool showLoader = true}) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;

    final requestToken = ++_requestToken;
    final repository = context.read<FinanceRepository>();
    if (showLoader) {
      setState(() {
        _isLoadingSummary = true;
        _isLoadingWallet = false;
        _error = null;
      });
    }

    try {
      final summaryFuture = repository.getWalletCheckpointSummary(wsId: wsId);
      final categoriesFuture = repository
          .getCategories(wsId)
          .catchError((_) => const <TransactionCategory>[]);
      final summary = await summaryFuture;
      final categories = await categoriesFuture;
      if (!mounted || requestToken != _requestToken) return;

      final selectedWalletId = _resolveSelectedWalletId(summary);
      setState(() {
        _summary = summary;
        _categories = categories;
        _selectedWalletId = selectedWalletId;
        _isLoadingSummary = false;
        _error = null;
      });

      if (selectedWalletId != null) {
        await _loadWalletCheckpoints(
          wsId: wsId,
          walletId: selectedWalletId,
          requestToken: requestToken,
          showLoader: showLoader,
        );
      }
    } on Exception catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _isLoadingSummary = false;
        _error = _errorMessage(error);
      });
    }
  }

  String? _resolveSelectedWalletId(WalletCheckpointSummaryResponse summary) {
    final wallets = summary.wallets;
    if (wallets.isEmpty) return null;
    final current = _selectedWalletId;
    if (current != null && wallets.any((wallet) => wallet.id == current)) {
      return current;
    }
    final latestIds = summary.latestCheckpoints
        .map((checkpoint) => checkpoint.walletId)
        .toSet();
    return wallets
            .where((wallet) => latestIds.contains(wallet.id))
            .firstOrNull
            ?.id ??
        wallets.first.id;
  }

  Future<void> _loadWalletCheckpoints({
    required String wsId,
    required String walletId,
    required int requestToken,
    bool showLoader = true,
  }) async {
    if (showLoader) {
      setState(() {
        _isLoadingWallet = true;
        _selectedWalletCheckpoints = null;
      });
    }

    try {
      final checkpoints = await context
          .read<FinanceRepository>()
          .getWalletCheckpoints(wsId: wsId, walletId: walletId);
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _selectedWalletCheckpoints = checkpoints;
        _isLoadingWallet = false;
      });
    } on Exception catch (error) {
      if (!mounted || requestToken != _requestToken) return;
      setState(() {
        _isLoadingWallet = false;
        _error = _errorMessage(error);
      });
    }
  }

  void _selectWallet(String walletId) {
    if (_selectedWalletId == walletId) return;
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final requestToken = ++_requestToken;
    setState(() {
      _selectedWalletId = walletId;
      _selectedWalletCheckpoints = null;
    });
    unawaited(
      _loadWalletCheckpoints(
        wsId: wsId,
        walletId: walletId,
        requestToken: requestToken,
      ),
    );
  }

  Future<void> _openCheckpointSheet(
    Wallet wallet, {
    WalletCheckpoint? checkpoint,
  }) async {
    final result = await showFinanceModal<WalletCheckpointFormResult>(
      context: context,
      builder: (_) =>
          WalletCheckpointFormSheet(wallet: wallet, checkpoint: checkpoint),
    );
    if (!mounted || result == null) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final savedMessage = context.l10n.financeCheckpointsSaved;
    final fallbackError = context.l10n.commonSomethingWentWrong;
    setState(() => _isMutating = true);

    try {
      if (checkpoint == null) {
        await context.read<FinanceRepository>().createWalletCheckpoint(
          wsId: wsId,
          walletId: wallet.id,
          actualBalance: result.actualBalance,
          checkedAt: result.checkedAt,
          note: result.note,
        );
      } else {
        await context.read<FinanceRepository>().updateWalletCheckpoint(
          wsId: wsId,
          walletId: wallet.id,
          checkpointId: checkpoint.id,
          actualBalance: result.actualBalance,
          checkedAt: result.checkedAt,
          note: result.note,
        );
      }
      FinanceCubit.clearWorkspaceCache(wsId);
      await _load(showLoader: false);
      if (!mounted || !toastContext.mounted) return;
      _showToast(toastContext, message: savedMessage);
    } on Exception catch (error) {
      if (!mounted || !toastContext.mounted) return;
      _showToast(
        toastContext,
        message: _errorMessage(error, fallbackError),
        destructive: true,
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  Future<void> _openDeleteSheet(WalletCheckpoint checkpoint) async {
    final showAmounts = context
        .read<FinancePreferencesCubit>()
        .state
        .showAmounts;
    final confirmed = await showFinanceModal<bool>(
      context: context,
      builder: (_) => WalletCheckpointDeleteSheet(
        checkpoint: checkpoint,
        showAmounts: showAmounts,
      ),
    );
    if (!mounted || confirmed != true) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final deletedMessage = context.l10n.financeCheckpointsDeleted;
    final fallbackError = context.l10n.commonSomethingWentWrong;
    setState(() => _isMutating = true);

    try {
      await context.read<FinanceRepository>().deleteWalletCheckpoint(
        wsId: wsId,
        walletId: checkpoint.walletId,
        checkpointId: checkpoint.id,
      );
      FinanceCubit.clearWorkspaceCache(wsId);
      await _load(showLoader: false);
      if (!mounted || !toastContext.mounted) return;
      _showToast(toastContext, message: deletedMessage);
    } on Exception catch (error) {
      if (!mounted || !toastContext.mounted) return;
      _showToast(
        toastContext,
        message: _errorMessage(error, fallbackError),
        destructive: true,
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  Future<void> _openReconciliationSheet(
    Wallet wallet,
    WalletCheckpointInterval interval,
  ) async {
    final showAmounts = context
        .read<FinancePreferencesCubit>()
        .state
        .showAmounts;
    final result =
        await showFinanceModal<WalletCheckpointReconciliationFormResult>(
          context: context,
          builder: (_) => WalletCheckpointReconciliationSheet(
            interval: interval,
            wallet: wallet,
            categories: _categories,
            showAmounts: showAmounts,
          ),
        );
    if (!mounted || result == null) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final createdMessage = context.l10n.financeCheckpointsReconciliationCreated;
    final cleanMessage = context.l10n.financeCheckpointsReconciliationClean;
    final fallbackError = context.l10n.commonSomethingWentWrong;
    setState(() => _isMutating = true);

    try {
      final response = await context
          .read<FinanceRepository>()
          .reconcileWalletCheckpoint(
            wsId: wsId,
            walletId: wallet.id,
            checkpointId: interval.endCheckpointId,
            basis: 'interval',
            categoryId: result.categoryId,
            description: result.description,
          );
      FinanceCubit.clearWorkspaceCache(wsId);
      await _load(showLoader: false);
      if (!mounted || !toastContext.mounted) return;
      _showToast(
        toastContext,
        message: response.created ? createdMessage : cleanMessage,
      );
    } on Exception catch (error) {
      if (!mounted || !toastContext.mounted) return;
      _showToast(
        toastContext,
        message: _errorMessage(error, fallbackError),
        destructive: true,
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  Future<void> _openBatchSheet() async {
    final summary = _summary;
    if (summary == null || summary.wallets.isEmpty || _isMutating) return;
    final showAmounts = context
        .read<FinancePreferencesCubit>()
        .state
        .showAmounts;
    final result = await showFinanceModal<WalletCheckpointBatchFormResult>(
      context: context,
      maxDialogWidth: 760,
      builder: (_) => WalletCheckpointBatchSheet(
        wallets: summary.wallets,
        showAmounts: showAmounts,
      ),
    );
    if (!mounted || result == null) return;

    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final toastContext = Navigator.of(context, rootNavigator: true).context;
    final savedMessage = context.l10n.financeCheckpointsBatchSaved;
    final fallbackError = context.l10n.commonSomethingWentWrong;
    setState(() => _isMutating = true);

    try {
      await context.read<FinanceRepository>().createWalletCheckpointBatch(
        wsId: wsId,
        checkedAt: result.checkedAt,
        entries: result.entries,
      );
      FinanceCubit.clearWorkspaceCache(wsId);
      await _load(showLoader: false);
      if (!mounted || !toastContext.mounted) return;
      _showToast(toastContext, message: savedMessage);
    } on Exception catch (error) {
      if (!mounted || !toastContext.mounted) return;
      _showToast(
        toastContext,
        message: _errorMessage(error, fallbackError),
        destructive: true,
      );
    } finally {
      if (mounted) {
        setState(() => _isMutating = false);
      }
    }
  }

  String _errorMessage(Object error, [String? fallback]) {
    if (error is ApiException) {
      final message = error.message.trim();
      if (message.isNotEmpty && message != 'Request failed') {
        return message;
      }
    }
    return fallback ?? context.l10n.commonSomethingWentWrong;
  }

  void _showToast(
    BuildContext toastContext, {
    required String message,
    bool destructive = false,
  }) {
    if (!toastContext.mounted) return;
    shad.showToast(
      context: toastContext,
      builder: (context, _) => destructive
          ? shad.Alert.destructive(content: Text(message))
          : shad.Alert(content: Text(message)),
    );
  }
}

class _CheckpointError extends StatelessWidget {
  const _CheckpointError({required this.error, required this.onRetry});

  final String? error;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FinanceEmptyState(
          icon: Icons.error_outline,
          title: context.l10n.commonSomethingWentWrong,
          body: error ?? context.l10n.financeCheckpointsTitle,
          action: shad.SecondaryButton(
            onPressed: () => unawaited(onRetry()),
            child: Text(context.l10n.commonRetry),
          ),
        ),
      ),
    );
  }
}

class _CheckpointEmpty extends StatelessWidget {
  const _CheckpointEmpty({required this.onBatchCheck});

  final VoidCallback onBatchCheck;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FinanceEmptyState(
          icon: Icons.fact_check_outlined,
          title: context.l10n.financeCheckpointsNoWallets,
          body: context.l10n.financeCheckpointsNoWalletsDetail,
          action: shad.SecondaryButton(
            onPressed: onBatchCheck,
            child: Text(context.l10n.financeCheckpointsBatchRecord),
          ),
        ),
      ),
    );
  }
}
