import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/cache/offline_network.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/debt_loan.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_debts_repository.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/utils/debt_filters.dart';
import 'package:mobile/features/finance/view/debt_detail_sheet.dart';
import 'package:mobile/features/finance/view/debt_form_sheet.dart';
import 'package:mobile/features/finance/widgets/debt_widgets.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Debts and loans: the net position, status and type filters, and one row
/// per entry. Rows open their repayment overview; finance managers create,
/// edit, change status and delete.
class DebtsPage extends StatelessWidget {
  const DebtsPage({
    this.repository,
    this.financeRepository,
    this.now,
    super.key,
  });

  /// Injected in tests; the page builds its own otherwise.
  final FinanceDebtsRepository? repository;
  final FinanceRepository? financeRepository;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final workspace = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    return Stack(
      fit: StackFit.expand,
      children: [
        ShellTitleOverride(
          ownerId: 'finance-debts',
          locations: const {Routes.financeDebts},
          title: context.l10n.financeDebts,
          showLeadingBrand: false,
          showAvatar: false,
        ),
        if (workspace != null)
          _DebtsView(
            key: ValueKey(workspace),
            workspace: workspace,
            repository: repository ?? FinanceDebtsRepository(),
            financeRepository: financeRepository ?? FinanceRepository(),
            now: now,
          ),
      ],
    );
  }
}

class _DebtsView extends StatefulWidget {
  const _DebtsView({
    required this.workspace,
    required this.repository,
    required this.financeRepository,
    this.now,
    super.key,
  });

  final String workspace;
  final FinanceDebtsRepository repository;
  final FinanceRepository financeRepository;
  final DateTime? now;

  @override
  State<_DebtsView> createState() => _DebtsViewState();
}

class _DebtsViewState extends State<_DebtsView> {
  List<DebtLoan>? _debts;
  DebtLoanSummary _summary = const DebtLoanSummary();
  List<Wallet> _wallets = const [];
  String _currency = 'USD';
  FinanceProblem? _problem;
  DebtLoanType? _type;
  DebtLoanStatus? _status = DebtLoanStatus.active;
  int _request = 0;

  DateTime get _now => widget.now ?? DateTime.now();

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load({bool force = false}) async {
    final request = ++_request;
    final ws = widget.workspace;
    try {
      final (debts, summary, wallets, currency) = await (
        widget.repository.list(ws, forceRefresh: force),
        widget.repository.summary(ws, forceRefresh: force),
        widget.financeRepository.getWallets(ws),
        widget.financeRepository.getWorkspaceDefaultCurrency(ws),
      ).wait;
      if (!mounted || request != _request) return;
      setState(() {
        _debts = debts;
        _summary = summary;
        _wallets = wallets;
        _currency = currency;
        _problem = null;
      });
    } on Object catch (error) {
      if (!mounted || request != _request) return;
      final failure = switch (error) {
        ParallelWaitError(
          errors: (
            final AsyncError? a,
            final AsyncError? b,
            final AsyncError? c,
            final AsyncError? d,
          ),
        ) =>
          (a ?? b ?? c ?? d)?.error ?? error,
        _ => error,
      };
      setState(
        () => _problem = switch (failure) {
          ApiException(statusCode: 403) => FinanceProblem.forbidden,
          final Object failure when isOfflineTransportFailure(failure) =>
            FinanceProblem.offline,
          _ => FinanceProblem.error,
        },
      );
    }
  }

  /// Runs a write, then reloads and confirms with [done].
  Future<void> _write(Future<void> Function() action, String done) async {
    final l10n = context.l10n;
    try {
      await action();
      if (!mounted) return;
      showAppToast(context, message: done);
      await _load(force: true);
    } on Object {
      if (mounted) {
        showAppToast(context, message: l10n.commonSomethingWentWrong);
      }
    }
  }

  Future<void> _openForm([DebtLoan? debt]) async {
    final saved = await showDebtFormSheet(
      context,
      wallets: _wallets,
      currency: _currency,
      now: _now,
      debt: debt,
    );
    if (saved == null || !mounted) return;
    final ws = widget.workspace;
    await _write(
      () => debt == null
          ? widget.repository.create(ws, saved)
          : widget.repository.update(ws, saved),
      context.l10n.financeDebtSaved,
    );
  }

  Future<void> _openDetail(DebtLoan debt) async {
    final l10n = context.l10n;
    final action = await showDebtDetailSheet(
      context,
      debt: debt,
      now: _now,
      canManage: canManageFinance(context, 'manage_finance', listen: false),
      wallet: _wallets
          .where((wallet) => wallet.id == debt.walletId)
          .firstOrNull,
    );
    if (!mounted) return;
    final ws = widget.workspace;
    switch (action) {
      case null:
        return;
      case DebtEdit():
        await _openForm(debt);
      case DebtSetStatus(:final status):
        await _write(
          () => widget.repository.setStatus(ws, debt.id, status),
          l10n.financeDebtStatusChanged,
        );
      case DebtDelete():
        final confirmed = await showAppConfirmDialog(
          context: context,
          title: l10n.financeDebtDeleteTitle(debt.name),
          message: l10n.financeDebtDeleteBody,
          confirmLabel: l10n.commonDelete,
          cancelLabel: l10n.commonCancel,
          destructive: true,
        );
        if (!confirmed || !mounted) return;
        await _write(
          () => widget.repository.delete(ws, debt.id),
          l10n.financeDebtDeleted,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final canManage = canManageFinance(context, 'manage_finance');
    final debts = _debts;
    final problem = _problem;
    final Widget body;
    if (debts == null && problem != null) {
      body = FinanceProblemView(
        problem: problem,
        onRetry: problem == FinanceProblem.forbidden
            ? null
            : () => unawaited(_load(force: true)),
      );
    } else if (debts == null) {
      body = const FinanceListSkeleton();
    } else if (debts.isEmpty) {
      body = AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: AppSpacing.xxxl),
          AppStateMessage(
            icon: LucideIcons.handCoins,
            title: l10n.financeDebtsEmpty,
            message: l10n.financeDebtsEmptyBody,
            actionLabel: canManage ? l10n.financeDebtNew : null,
            onAction: canManage ? () => unawaited(_openForm()) : null,
          ),
        ],
      );
    } else {
      final visible = visibleDebts(
        debts,
        type: _type,
        status: _status,
        now: _now,
      );
      body = CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverAppPage(
            includeBottom: false,
            sliver: SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(bottom: AppLayout.itemGap),
                child: DebtSummaryHero(summary: _summary, currency: _currency),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: DebtFilters(
              debts: debts,
              type: _type,
              status: _status,
              onTypeChanged: (type) => setState(() => _type = type),
              onStatusChanged: (status) => setState(() => _status = status),
            ),
          ),
          SliverAppPage(
            includeTop: false,
            sliver: SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.only(top: AppLayout.itemGap),
                child: visible.isEmpty
                    ? AppStateMessage.inline(
                        icon: LucideIcons.listFilter,
                        title: l10n.financeDebtsNoMatches,
                      )
                    : AppGroupedCard(
                        children: [
                          for (final debt in visible)
                            DebtRow(
                              key: ValueKey(debt.id),
                              debt: debt,
                              now: _now,
                              onTap: () => unawaited(_openDetail(debt)),
                            ),
                        ],
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
          ownerId: 'finance-debts',
          locations: const {Routes.financeDebts},
          actions: [
            financeAmountVisibilityAction(
              context,
              showAmounts: financeAmountsVisible(context),
              id: 'finance-debts-amount-visibility',
            ),
            if (canManage)
              financeCreateAction(
                id: 'finance-debt-create',
                tooltip: l10n.financeDebtNew,
                onPressed: debts == null ? null : () => unawaited(_openForm()),
              ),
          ],
        ),
        NovaRefreshIndicator(onRefresh: () => _load(force: true), child: body),
      ],
    );
  }
}
