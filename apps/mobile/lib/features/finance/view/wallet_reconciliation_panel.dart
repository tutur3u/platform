import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/widgets/checkpoint_amounts.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/wallet_adjustment_sheet.dart';
import 'package:mobile/features/finance/widgets/wallet_reconciliation_form.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

class WalletReconciliationPanel extends StatelessWidget {
  const WalletReconciliationPanel({
    required this.wallet,
    required this.currency,
    required this.revision,
    required this.onAdjustment,
    super.key,
  });

  final Wallet wallet;
  final String currency;
  final int revision;
  final Future<void> Function() onAdjustment;

  @override
  Widget build(BuildContext context) {
    final wsId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    final actor = context.select<AuthCubit?, String?>(
      (cubit) => cubit?.state.user?.id,
    );
    if (wsId == null) return const SizedBox.shrink();
    return _WalletCheckpointHistory(
      key: ValueKey((wsId, actor, wallet.id)),
      workspaceId: wsId,
      actor: actor,
      wallet: wallet,
      currency: currency,
      revision: revision,
      onAdjustment: onAdjustment,
    );
  }
}

class _WalletCheckpointHistory extends StatefulWidget {
  const _WalletCheckpointHistory({
    required this.workspaceId,
    required this.actor,
    required this.wallet,
    required this.currency,
    required this.revision,
    required this.onAdjustment,
    super.key,
  });

  final String workspaceId;
  final String? actor;
  final Wallet wallet;
  final String currency;
  final int revision;
  final Future<void> Function() onAdjustment;

  @override
  State<_WalletCheckpointHistory> createState() =>
      _WalletCheckpointHistoryState();
}

class _WalletCheckpointHistoryState extends State<_WalletCheckpointHistory> {
  WalletCheckpointListResponse? _history;
  bool _failed = false;
  bool _busy = false;
  AppToastHandle? _toast;
  int _loadId = 0;
  bool _scopeChanged = false;
  late final StreamSubscription<String?> _workspaceSubscription;
  StreamSubscription<String?>? _actorSubscription;

  bool get _active =>
      mounted &&
      !_scopeChanged &&
      context.read<WorkspaceCubit>().state.currentWorkspace?.id ==
          widget.workspaceId &&
      context.read<AuthCubit?>()?.state.user?.id == widget.actor;

  FinanceRepository get _repository => context.read<FinanceRepository>();

  @override
  void initState() {
    super.initState();
    _workspaceSubscription = context
        .read<WorkspaceCubit>()
        .stream
        .map((state) => state.currentWorkspace?.id)
        .listen((id) {
          if (id != widget.workspaceId) _scopeChanged = true;
        });
    _actorSubscription = context
        .read<AuthCubit?>()
        ?.stream
        .map((state) => state.user?.id)
        .listen((id) {
          if (id != widget.actor) _scopeChanged = true;
        });
    unawaited(_load());
  }

  @override
  void dispose() {
    _toast?.close();
    unawaited(_workspaceSubscription.cancel());
    unawaited(_actorSubscription?.cancel());
    super.dispose();
  }

  @override
  void didUpdateWidget(_WalletCheckpointHistory oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.revision != oldWidget.revision) unawaited(_load());
  }

  Future<void> _load({bool force = false}) async {
    final loadId = ++_loadId;
    void show(WalletCheckpointListResponse history) {
      if (!_active || loadId != _loadId) return;
      setState(() {
        _history = history;
        _failed = false;
      });
    }

    final repository = _repository;
    final workspace = widget.workspaceId;
    final walletId = widget.wallet.id;
    try {
      final history = await CacheStore.readWithRevalidation(
        () => repository.getWalletCheckpoints(
          wsId: workspace,
          walletId: walletId,
          forceRefresh: force,
        ),
        onSnapshot: show,
      );
      show(history);
    } on Exception {
      if (_active && loadId == _loadId) setState(() => _failed = true);
    }
  }

  Future<void> _mutate(Future<void> Function() action) async {
    if (!mounted || _busy || !_active) return;
    setState(() => _busy = true);
    try {
      await action();
    } on Exception {
      if (mounted && _active) {
        showAppToast(context, message: context.l10n.commonSomethingWentWrong);
      }
    } finally {
      if (mounted && _active) setState(() => _busy = false);
    }
  }

  Future<void> _review([WalletCheckpoint? checkpoint]) => _mutate(() async {
    final result = await showWalletBalanceReview(
      context,
      wallet: widget.wallet,
      currency: checkpoint?.currency ?? widget.currency,
      checkpoint: checkpoint,
    );
    if (result == null ||
        !mounted ||
        !_active ||
        !canManageFinance(context, 'update_wallets', listen: false)) {
      return;
    }
    final repository = _repository;
    final before = _pendingIds;
    final workspace = widget.workspaceId;
    final wallet = widget.wallet.id;
    if (checkpoint == null) {
      await repository.createWalletCheckpoint(
        wsId: workspace,
        walletId: wallet,
        actualBalance: result.amount,
        checkedAt: result.checkedAt,
        note: result.note,
      );
    } else {
      await repository.updateWalletCheckpoint(
        wsId: workspace,
        walletId: wallet,
        checkpointId: checkpoint.id,
        actualBalance: result.amount,
        checkedAt: result.checkedAt,
        note: result.note,
      );
    }
    if (mounted && _active) {
      await _afterWrite(before, context.l10n.financeCheckpointsSaved);
    }
  });

  Future<void> _toggleReview(WalletCheckpoint checkpoint) => _mutate(() async {
    bool allowed() =>
        _active &&
        canManageFinance(context, 'update_wallets', listen: false) &&
        canManageFinance(context, 'view_transactions', listen: false);
    if (!allowed()) return;
    try {
      await _repository.setWalletCheckpointReview(
        wsId: widget.workspaceId,
        checkpoint: checkpoint,
        reviewed: checkpoint.reviewedAt == null,
        active: allowed,
      );
    } on ApiException catch (error) {
      if (error.statusCode != 409 || !mounted || !_active) rethrow;
      showAppToast(
        context,
        message: context.l10n.financeCheckpointReviewChanged,
      );
    }
    if (_active) await _load(force: true);
  });

  Future<void> _delete(WalletCheckpoint checkpoint) => _mutate(() async {
    final confirmed = await showAppActionSheet<bool>(
      context: context,
      title: context.l10n.financeCheckpointsDelete,
      description: context.l10n.financeCheckpointsDeleteDescription,
      actions: [
        AppSheetAction(
          label: context.l10n.commonDelete,
          icon: LucideIcons.trash2,
          value: true,
          destructive: true,
        ),
      ],
    );
    if (confirmed != true ||
        !mounted ||
        !_active ||
        !canManageFinance(context, 'update_wallets', listen: false)) {
      return;
    }
    final before = _pendingIds;
    await _repository.deleteWalletCheckpoint(
      wsId: widget.workspaceId,
      walletId: widget.wallet.id,
      checkpointId: checkpoint.id,
    );
    if (mounted && _active) {
      await _afterWrite(before, context.l10n.financeCheckpointsDeleted);
    }
  });

  Future<void> _adjust(
    WalletCheckpoint checkpoint, {
    WalletCheckpointInterval? interval,
  }) => _mutate(() async {
    final l10n = context.l10n;
    final result = await showWalletAdjustment(
      context,
      wallet: widget.wallet,
      checkpoint: checkpoint,
      interval: interval,
      categories: _repository.getCategories(widget.workspaceId),
    );
    if (result == null ||
        !mounted ||
        !_active ||
        !canManageFinance(context, 'create_transactions', listen: false)) {
      return;
    }
    final before = _pendingIds;
    final response = await _repository.reconcileWalletCheckpoint(
      wsId: widget.workspaceId,
      walletId: widget.wallet.id,
      checkpointId: checkpoint.id,
      basis: interval == null ? 'checkpoint' : 'interval',
      categoryId: result.categoryId,
      description: result.description,
    );
    if (!mounted || !_active) return;
    await _afterWrite(
      before,
      response.created
          ? l10n.financeCheckpointsReconciliationCreated
          : l10n.financeCheckpointsReconciliationClean,
    );
    if (_active && response.created) await widget.onAdjustment();
  });

  Iterable<PendingMutationRecord> get _pending =>
      _repository.mutationQueue.pending.value.where(
        (edit) =>
            edit.workspaceId == widget.workspaceId &&
            edit.userId == widget.actor &&
            edit.feature == 'finance',
      );

  Set<String> get _pendingIds => _pending.map((edit) => edit.id).toSet();

  Future<void> _afterWrite(Set<String> before, String message) async {
    final l10n = context.l10n;
    final pending = _pending
        .where((edit) => !before.contains(edit.id))
        .firstOrNull;
    _toast = showAppToast(
      context,
      message: switch (pending?.status) {
        PendingMutationStatus.queued => l10n.offlineEditQueued,
        PendingMutationStatus.failed => l10n.offlineEditFailed,
        PendingMutationStatus.conflict => l10n.offlineEditConflict,
        _ => message,
      },
    );
    FinanceCubit.clearWorkspaceCache(widget.workspaceId);
    await _load(force: true);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final history = _history;
    final canChange = !_busy && canManageFinance(context, 'update_wallets');
    final canAdjust =
        !_busy && canManageFinance(context, 'create_transactions');
    final visible = financeAmountsVisible(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (canChange)
          AppButton.secondary(
            onPressed: () => unawaited(_review()),
            child: Text(l10n.financeCheckpointsReconcile),
          ),
        if (_failed)
          AppStateMessage.inline(
            icon: LucideIcons.circleAlert,
            title: l10n.commonSomethingWentWrong,
            tone: AppTone.destructive,
            actionLabel: l10n.commonRetry,
            onAction: () => unawaited(_load(force: true)),
          ),
        if (history == null && !_failed)
          const AppSkeletonRows()
        else if (history != null && history.data.isEmpty)
          AppStateMessage.inline(
            icon: LucideIcons.listChecks,
            title: l10n.financeCheckpointsNoCheckpoint,
            message: l10n.financeCheckpointsNoCheckpointDetail,
          )
        else if (history != null)
          ValueListenableBuilder(
            valueListenable: _repository.mutationQueue.pending,
            builder: (context, _, _) {
              final pendingIds = _pending.map((edit) => edit.entityId).toSet();
              return AppDisclosure(
                title: Text(l10n.financeCheckpointsTimeline),
                leading: const AppIconTile(icon: LucideIcons.history),
                children: [
                  AppGroupedCard(
                    children: [
                      for (final checkpoint in history.data)
                        PendingSyncFrame(
                          key: ValueKey(checkpoint.id),
                          workspaceId: widget.workspaceId,
                          entityId: checkpoint.id,
                          feature: 'finance',
                          child: AppRichRow(
                            title: DateFormat.yMMMd(
                              Localizations.localeOf(context).toString(),
                            ).add_jm().format(checkpoint.checkedAt.toLocal()),
                            subtitle: checkpoint.note,
                            trailingCaption: checkpoint.reviewAvailable
                                ? checkpoint.reviewedAt == null
                                      ? l10n.financeCheckpointNeedsReview
                                      : l10n.financeCheckpointReviewed
                                : null,
                            leading: const AppIconTile(
                              icon: LucideIcons.history,
                            ),
                            trailing: pendingIds.contains(checkpoint.id)
                                ? null
                                : FinanceAmountText(
                                    checkpoint.currentVariance,
                                    checkpoint.currency,
                                    signed: true,
                                    color: visible
                                        ? checkpointVarianceTone(
                                            checkpoint.currentVariance,
                                          ).foreground(
                                            context.tokens.colorScheme,
                                          )
                                        : null,
                                  ),
                            onTap: () => unawaited(
                              _openDetails(
                                checkpoint,
                                interval: history.intervals
                                    .where(
                                      (item) =>
                                          item.endCheckpointId == checkpoint.id,
                                    )
                                    .firstOrNull,
                                canChange: canChange,
                                canReview:
                                    canChange &&
                                    checkpoint.reviewAvailable &&
                                    !pendingIds.contains(checkpoint.id),
                                canAdjust:
                                    canAdjust &&
                                    !pendingIds.contains(checkpoint.id),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              );
            },
          ),
      ],
    );
  }

  Future<void> _openDetails(
    WalletCheckpoint checkpoint, {
    required WalletCheckpointInterval? interval,
    required bool canChange,
    required bool canReview,
    required bool canAdjust,
  }) async {
    if (!_active || _busy) return;
    _toast?.close();
    final preferences = context.read<FinancePreferencesCubit?>();
    final action = await showAppSheet<_CheckpointAction>(
      context: context,
      builder: (context) {
        final l10n = context.l10n;
        final details = AppSheetScaffold(
          title: l10n.financeCheckpointsShortLabel,
          description: checkpoint.note,
          actions: [
            if (canChange) ...[
              AppButton.ghost(
                onPressed: () =>
                    Navigator.of(context).pop(_CheckpointAction.delete),
                child: Text(l10n.commonDelete),
              ),
              AppButton.secondary(
                onPressed: () =>
                    Navigator.of(context).pop(_CheckpointAction.edit),
                child: Text(l10n.commonEdit),
              ),
            ],
            if (canAdjust && checkpoint.currentVariance != 0)
              AppButton.primary(
                onPressed: () =>
                    Navigator.of(context).pop(_CheckpointAction.adjust),
                child: Text(l10n.financeCheckpointsCreateAdjustment),
              ),
            if (canAdjust && interval != null && !interval.isClean)
              AppButton.secondary(
                onPressed: () =>
                    Navigator.of(context).pop(_CheckpointAction.interval),
                child: Text(l10n.financeCheckpointsWindows),
              ),
          ],
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: AppSpacing.md,
            children: [
              CheckpointAmounts(
                actual: checkpoint.actualBalance,
                ledger: checkpoint.currentLedgerBalance,
                variance: checkpoint.currentVariance,
                currency: checkpoint.currency,
              ),
              if (checkpoint.reviewAvailable)
                AppRichRow(
                  title: checkpoint.reviewedAt == null
                      ? l10n.financeCheckpointNeedsReview
                      : l10n.financeCheckpointReviewed,
                  trailing: canReview
                      ? AppButton.secondary(
                          onPressed: () => Navigator.of(
                            context,
                          ).pop(_CheckpointAction.toggleReview),
                          child: Text(
                            checkpoint.reviewedAt == null
                                ? l10n.financeCheckpointMarkReviewed
                                : l10n.financeCheckpointReopen,
                          ),
                        )
                      : null,
                ),
            ],
          ),
        );
        return preferences == null
            ? details
            : BlocProvider.value(value: preferences, child: details);
      },
    );
    if (!mounted || !_active) return;
    switch (action) {
      case _CheckpointAction.delete:
        await _delete(checkpoint);
      case _CheckpointAction.edit:
        await _review(checkpoint);
      case _CheckpointAction.adjust:
        await _adjust(checkpoint);
      case _CheckpointAction.interval:
        await _adjust(checkpoint, interval: interval);
      case _CheckpointAction.toggleReview:
        await _toggleReview(checkpoint);
      case null:
        break;
    }
  }
}

enum _CheckpointAction { delete, edit, adjust, interval, toggleReview }
