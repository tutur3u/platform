import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/pending_mutation_record.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/wallet_checkpoint.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/view/wallet_reconciliation_panel.dart';
import 'package:mobile/features/finance/widgets/checkpoint_amounts.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/wallet_checkpoint_sheets.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class FinanceCheckpointsPage extends StatelessWidget {
  const FinanceCheckpointsPage({
    this.initialWalletId,
    this.repository,
    super.key,
  });

  final FinanceRepository? repository;
  final String? initialWalletId;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    final actor = context.select<AuthCubit?, String?>(
      (cubit) => cubit?.state.user?.id,
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        const FinanceAmountVisibilityShellAction(
          ownerId: 'finance-checkpoints-amount-visibility',
          locations: {Routes.financeCheckpoints},
        ),
        ShellTitleOverride(
          ownerId: 'finance-checkpoints',
          locations: const {Routes.financeCheckpoints},
          title: context.l10n.financeCheckpointsShortLabel,
          showLeadingBrand: false,
          showAvatar: false,
        ),
        if (workspace != null)
          RepositoryProvider(
            create: (_) => repository ?? FinanceRepository(),
            child: _CheckpointOverview(
              key: ValueKey((workspace, actor)),
              workspace: workspace,
              actor: actor,
              initialWalletId: initialWalletId,
            ),
          ),
      ],
    );
  }
}

class _CheckpointOverview extends StatefulWidget {
  const _CheckpointOverview({
    required this.workspace,
    required this.actor,
    required this.initialWalletId,
    super.key,
  });

  final String workspace;
  final String? actor;
  final String? initialWalletId;

  @override
  State<_CheckpointOverview> createState() => _CheckpointOverviewState();
}

class _CheckpointOverviewState extends State<_CheckpointOverview> {
  WalletCheckpointSummaryResponse? _summary;
  int _request = 0;
  bool _failed = false;
  bool _busy = false;
  bool _scopeChanged = false;
  late final StreamSubscription<String?> _workspaceSubscription;
  StreamSubscription<String?>? _actorSubscription;

  bool get _active =>
      mounted &&
      !_scopeChanged &&
      context.read<WorkspaceCubit>().state.currentWorkspace?.id ==
          widget.workspace &&
      context.read<AuthCubit?>()?.state.user?.id == widget.actor;

  @override
  void initState() {
    super.initState();
    _workspaceSubscription = context
        .read<WorkspaceCubit>()
        .stream
        .map((state) => state.currentWorkspace?.id)
        .listen((id) {
          if (id != widget.workspace) _scopeChanged = true;
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
    unawaited(_workspaceSubscription.cancel());
    unawaited(_actorSubscription?.cancel());
    super.dispose();
  }

  Future<void> _load({bool force = false}) async {
    final request = ++_request;
    final repository = context.read<FinanceRepository>();
    void show(WalletCheckpointSummaryResponse summary) {
      if (!_active || request != _request) return;
      setState(() {
        _summary = summary;
        _failed = false;
      });
    }

    try {
      final summary = await CacheStore.readWithRevalidation(
        () => repository.getWalletCheckpointSummary(
          wsId: widget.workspace,
          forceRefresh: force,
        ),
        onSnapshot: show,
      );
      show(summary);
    } on Exception {
      if (_active && request == _request) setState(() => _failed = true);
    }
  }

  Future<void> _batchCheck(WalletCheckpointSummaryResponse summary) async {
    if (!mounted || _busy || !_active) return;
    final repository = context.read<FinanceRepository>();
    final preferences = context.read<FinancePreferencesCubit?>();
    setState(() => _busy = true);
    try {
      final result = await showAppSheet<WalletCheckpointBatchFormResult>(
        context: context,
        size: AppSheetSize.large,
        builder: (_) {
          final form = WalletCheckpointBatchSheet(wallets: summary.wallets);
          return preferences == null
              ? form
              : BlocProvider.value(value: preferences, child: form);
        },
      );
      if (!mounted ||
          !_active ||
          result == null ||
          !canManageFinance(context, 'update_wallets', listen: false)) {
        return;
      }
      final before = repository.mutationQueue.pending.value
          .map((edit) => edit.id)
          .toSet();
      await repository.createWalletCheckpointBatch(
        wsId: widget.workspace,
        checkedAt: result.checkedAt,
        entries: result.entries,
      );
      if (!mounted || !_active) return;
      final pending = repository.mutationQueue.pending.value
          .where(
            (edit) =>
                edit.feature == 'finance' &&
                edit.workspaceId == widget.workspace &&
                edit.userId == widget.actor &&
                !before.contains(edit.id),
          )
          .firstOrNull;
      final l10n = context.l10n;
      showAppToast(
        context,
        message: switch (pending?.status) {
          PendingMutationStatus.queued => l10n.offlineEditQueued,
          PendingMutationStatus.failed => l10n.offlineEditFailed,
          PendingMutationStatus.conflict => l10n.offlineEditConflict,
          _ => l10n.financeCheckpointsBatchSaved,
        },
      );
      FinanceCubit.clearWorkspaceCache(widget.workspace);
      await _load(force: true);
    } on Exception {
      if (mounted && _active) {
        showAppToast(context, message: context.l10n.commonSomethingWentWrong);
      }
    } finally {
      if (mounted && _active) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = _summary;
    final l10n = context.l10n;
    final visible = financeAmountsVisible(context);
    final selected = summary?.wallets
        .where((wallet) => wallet.id == widget.initialWalletId)
        .firstOrNull;
    final latest = {
      for (final row in summary?.latestCheckpoints ?? <WalletCheckpoint>[])
        row.walletId: row,
    };
    return NovaRefreshIndicator(
      onRefresh: () => _load(force: true),
      child: AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          if (_failed)
            AppStateMessage.inline(
              icon: LucideIcons.circleAlert,
              title: l10n.commonSomethingWentWrong,
              tone: AppTone.destructive,
              actionLabel: l10n.commonRetry,
              onAction: () => unawaited(_load(force: true)),
            ),
          if (summary == null && !_failed)
            const AppSkeletonRows()
          else if (summary != null && summary.wallets.isEmpty)
            AppStateMessage(
              icon: LucideIcons.wallet,
              title: l10n.financeCheckpointsNoWallets,
              message: l10n.financeCheckpointsNoWalletsDetail,
            )
          else if (selected != null) ...[
            AppGroupedCard(
              children: [
                AppRichRow(
                  title: selected.name ?? l10n.financeWallet,
                  leading: const AppIconTile(icon: LucideIcons.wallet),
                  onTap: () =>
                      context.push(Routes.walletDetailPath(selected.id)),
                ),
              ],
            ),
            const AppGap(AppLayout.itemGap),
            WalletReconciliationPanel(
              wallet: selected,
              currency: (selected.currency ?? '').toUpperCase(),
              revision: _request,
              onAdjustment: () => _load(force: true),
            ),
          ] else if (summary != null) ...[
            if (canManageFinance(context, 'update_wallets')) ...[
              AppButton.primary(
                onPressed: _busy ? null : () => unawaited(_batchCheck(summary)),
                child: Text(l10n.financeCheckpointsBatchRecord),
              ),
              const AppGap(AppLayout.itemGap),
            ],
            AppGroupedCard(
              children: [
                for (final wallet in summary.wallets)
                  AppRichRow(
                    key: ValueKey(wallet.id),
                    title: wallet.name ?? l10n.financeWallet,
                    subtitle: latest[wallet.id] == null
                        ? l10n.financeCheckpointsNoCheckpoint
                        : l10n.financeCheckpointsCurrentVariance,
                    leading: const AppIconTile(icon: LucideIcons.wallet),
                    trailing: switch (latest[wallet.id]) {
                      final checkpoint? => FinanceAmountText(
                        checkpoint.currentVariance,
                        checkpoint.currency,
                        signed: true,
                        color: visible
                            ? checkpointVarianceTone(
                                checkpoint.currentVariance,
                              ).foreground(context.tokens.colorScheme)
                            : null,
                      ),
                      null => null,
                    },
                    onTap: () =>
                        context.push(Routes.walletDetailPath(wallet.id)),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
