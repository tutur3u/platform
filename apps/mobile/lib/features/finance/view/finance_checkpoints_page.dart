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
import 'package:mobile/features/finance/utils/checkpoint_wallets.dart';
import 'package:mobile/features/finance/view/wallet_reconciliation_panel.dart';
import 'package:mobile/features/finance/widgets/checkpoint_wallet_list.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/wallet_checkpoint_sheets.dart';
import 'package:mobile/features/finance/widgets/wallet_dialog.dart';
import 'package:mobile/features/settings/cubit/finance_preferences_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
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
  CheckpointWalletFilter _filter = CheckpointWalletFilter.all;
  CheckpointWalletSort _sort = CheckpointWalletSort.name;

  /// Archive changes the server summary has not caught up with yet.
  final Map<String, DateTime?> _archived = {};
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
          final form = WalletCheckpointBatchSheet(
            wallets: [
              for (final wallet in summary.wallets)
                if (!(_archived.containsKey(wallet.id)
                    ? _archived[wallet.id] != null
                    : wallet.isArchived))
                  wallet,
            ],
          );
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

  Future<void> _createWallet() async {
    if (!_active) return;
    final created = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => WalletDialog(
        wsId: widget.workspace,
        repository: context.read<FinanceRepository>(),
      ),
    );
    if (created != true || !mounted || !_active) return;
    FinanceCubit.clearWorkspaceCache(widget.workspace);
    await _load(force: true);
  }

  /// Archives or restores the entry's wallet at once, then offers Undo.
  Future<void> _setArchived(
    CheckpointWalletEntry entry,
    bool archived, {
    bool undoable = true,
  }) async {
    if (!_active) return;
    final wallet = entry.wallet;
    final repository = context.read<FinanceRepository>();
    final l10n = context.l10n;
    final name = wallet.name ?? l10n.financeWallet;
    final previous = wallet.archivedAt;
    setState(() => _archived[wallet.id] = archived ? DateTime.now() : null);
    if (undoable) {
      showAppToast(
        context,
        message: archived
            ? l10n.financeWalletArchivedToast(name)
            : l10n.financeWalletRestoredToast(name),
        actionLabel: l10n.financeUndo,
        onAction: () => unawaited(
          _setArchived(
            CheckpointWalletEntry(
              wallet.withArchivedAt(_archived[wallet.id]),
              entry.latest,
            ),
            !archived,
            undoable: false,
          ),
        ),
      );
    }
    try {
      await repository.setWalletArchived(
        wsId: widget.workspace,
        walletId: wallet.id,
        archived: archived,
      );
      if (!mounted || !_active) return;
      FinanceCubit.clearWorkspaceCache(widget.workspace);
      await _load(force: true);
    } on Exception {
      if (!mounted || !_active) return;
      setState(() => _archived[wallet.id] = previous);
      showAppToast(context, message: l10n.commonSomethingWentWrong);
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = _summary;
    final l10n = context.l10n;
    final selected = summary?.wallets
        .where((wallet) => wallet.id == widget.initialWalletId)
        .firstOrNull;
    final canUpdate = canManageFinance(context, 'update_wallets');
    final canCreate = canManageFinance(context, 'create_wallets');
    final entries = summary == null
        ? const <CheckpointWalletEntry>[]
        : checkpointWalletEntries(summary, archived: _archived);
    final Widget body;
    if (summary == null || summary.wallets.isEmpty || selected != null) {
      body = AppPageListView(
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
              actionLabel: canCreate ? l10n.financeCreateWallet : null,
              onAction: canCreate ? () => unawaited(_createWallet()) : null,
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
          ],
        ],
      );
    } else {
      final visible = visibleCheckpointWallets(
        entries,
        filter: _filter,
        sort: _sort,
      );
      body = CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          if (_failed || canUpdate)
            SliverAppPage(
              includeBottom: false,
              sliver: SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: AppLayout.itemGap),
                  child: _failed
                      ? AppStateMessage.inline(
                          icon: LucideIcons.circleAlert,
                          title: l10n.commonSomethingWentWrong,
                          tone: AppTone.destructive,
                          actionLabel: l10n.commonRetry,
                          onAction: () => unawaited(_load(force: true)),
                        )
                      : AppButton.primary(
                          key: const ValueKey('checkpoint-batch'),
                          onPressed:
                              _busy ||
                                  !entries.any(
                                    (entry) => !entry.wallet.isArchived,
                                  )
                              ? null
                              : () => unawaited(_batchCheck(summary)),
                          leading: const Icon(LucideIcons.listChecks),
                          child: Text(l10n.financeCheckpointsBatchRecord),
                        ),
                ),
              ),
            ),
          SliverToBoxAdapter(
            child: Padding(
              padding: EdgeInsets.only(
                top: _failed || canUpdate ? 0 : AppLayout.pageTop,
              ),
              child: CheckpointWalletFilters(
                entries: entries,
                filter: _filter,
                sort: _sort,
                onFilterChanged: (filter) => setState(() => _filter = filter),
                onSortChanged: (sort) => setState(() => _sort = sort),
              ),
            ),
          ),
          SliverAppPage(
            includeTop: false,
            sliver: SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(top: AppLayout.itemGap),
                child: CheckpointWalletCard(
                  entries: visible,
                  onOpen: (entry) => context.push(
                    Routes.financeCheckpointsPath(walletId: entry.wallet.id),
                  ),
                  onArchive: canUpdate
                      ? (entry, archived) =>
                            unawaited(_setArchived(entry, archived))
                      : null,
                ),
              ),
            ),
          ),
        ],
      );
    }
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellChromeActions(
          ownerId: 'finance-checkpoints-create-wallet',
          locations: const {Routes.financeCheckpoints},
          actions: [
            if (canCreate && selected == null)
              financeCreateAction(
                id: 'finance-checkpoints-create-wallet',
                tooltip: l10n.financeCreateWallet,
                onPressed: () => unawaited(_createWallet()),
              ),
          ],
        ),
        NovaRefreshIndicator(onRefresh: () => _load(force: true), child: body),
      ],
    );
  }
}
