import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/data/models/finance/budget.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/budgets_cubit.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/view/budget_detail_sheet.dart';
import 'package:mobile/features/finance/view/budget_form_page.dart';
import 'package:mobile/features/finance/view/budget_widgets.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Workspace spending budgets: the month's combined progress and one card
/// per active budget. Create and edit open full screen above the shell.
class BudgetsPage extends StatelessWidget {
  const BudgetsPage({this.repository, this.now, super.key});

  /// Injected in tests; the page builds its own otherwise.
  final FinanceRepository? repository;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => repository ?? FinanceRepository(),
      child: BlocProvider(
        create: (context) {
          final cubit = BudgetsCubit(
            repository: context.read<FinanceRepository>(),
          );
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId != null) unawaited(cubit.load(wsId));
          return cubit;
        },
        child: BudgetsView(now: now),
      ),
    );
  }
}

class BudgetsView extends StatelessWidget {
  const BudgetsView({this.now, super.key});

  final DateTime? now;

  Future<void> _reload(BuildContext context) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    await context.read<BudgetsCubit>().load(wsId, forceRefresh: true);
  }

  Future<void> _openDetail(BuildContext context, FinanceBudget budget) async {
    final state = context.read<BudgetsCubit>().state;
    final edit = await showBudgetDetailSheet(
      context,
      budget: budget,
      currency: state.workspaceCurrency,
      now: now ?? DateTime.now(),
      canEdit: canManageFinance(context, 'manage_finance'),
      category: state.categoryFor(budget.categoryId),
      wallet: state.wallets
          .where((wallet) => wallet.id == budget.walletId)
          .firstOrNull,
    );
    if (edit && context.mounted) await _openForm(context, budget);
  }

  Future<void> _openForm(BuildContext context, [FinanceBudget? budget]) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final cubit = context.read<BudgetsCubit>();
    final result = await showBudgetForm(
      context,
      cubit: cubit,
      wsId: wsId,
      budget: budget,
      now: now,
    );
    if (result == null || !context.mounted) return;
    showAppToast(
      context,
      message: switch (result) {
        BudgetFormResult.saved => context.l10n.financeBudgetSaved,
        BudgetFormResult.pending => context.l10n.offlineEditQueued,
        BudgetFormResult.deleted => context.l10n.financeBudgetDeleted,
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final showAmounts = financeAmountsVisible(context);
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, state) {
        final wsId = state.currentWorkspace?.id;
        if (wsId != null) unawaited(context.read<BudgetsCubit>().load(wsId));
      },
      child: Stack(
        fit: StackFit.expand,
        children: [
          ShellTitleOverride(
            ownerId: 'finance-budgets',
            locations: const {Routes.financeBudgets},
            title: l10n.financeBudgets,
            showLeadingBrand: false,
            showAvatar: false,
          ),
          BlocBuilder<BudgetsCubit, BudgetsState>(
            buildWhen: (a, b) => a.status != b.status,
            builder: (context, state) => ShellChromeActions(
              ownerId: 'finance-budgets',
              locations: const {Routes.financeBudgets},
              actions: [
                financeAmountVisibilityAction(
                  context,
                  showAmounts: showAmounts,
                  id: 'finance-budgets-amount-visibility',
                ),
                if (canManageFinance(context, 'manage_finance'))
                  financeCreateAction(
                    id: 'finance-budget-create',
                    tooltip: l10n.financeNewBudget,
                    onPressed: state.status == BudgetsStatus.loaded
                        ? () => unawaited(_openForm(context))
                        : null,
                  ),
              ],
            ),
          ),
          BlocBuilder<BudgetsCubit, BudgetsState>(
            builder: (context, state) => switch (state.status) {
              BudgetsStatus.initial ||
              BudgetsStatus.loading => const FinanceListSkeleton(),
              BudgetsStatus.forbidden => const FinanceProblemView(
                problem: FinanceProblem.forbidden,
              ),
              BudgetsStatus.offline => FinanceProblemView(
                problem: FinanceProblem.offline,
                onRetry: () => unawaited(_reload(context)),
              ),
              BudgetsStatus.error => FinanceProblemView(
                problem: FinanceProblem.error,
                message: state.error,
                onRetry: () => unawaited(_reload(context)),
              ),
              BudgetsStatus.loaded => NovaRefreshIndicator(
                onRefresh: () => _reload(context),
                child: _BudgetsList(
                  state: state,
                  now: now ?? DateTime.now(),
                  onOpen: (budget) => unawaited(_openDetail(context, budget)),
                  onCreate: canManageFinance(context, 'manage_finance')
                      ? () => unawaited(_openForm(context))
                      : null,
                ),
              ),
            },
          ),
        ],
      ),
    );
  }
}

class _BudgetsList extends StatelessWidget {
  const _BudgetsList({
    required this.state,
    required this.now,
    required this.onOpen,
    required this.onCreate,
  });

  final BudgetsState state;
  final DateTime now;
  final ValueChanged<FinanceBudget> onOpen;
  final VoidCallback? onCreate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (state.budgets.isEmpty) {
      return AppPageListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: AppSpacing.xxxl),
          AppStateMessage(
            icon: LucideIcons.target,
            title: l10n.financeNoBudgets,
            message: l10n.financeNoBudgetsBody,
            actionLabel: l10n.financeNewBudget,
            onAction: onCreate,
          ),
        ],
      );
    }
    final currency = state.workspaceCurrency;
    final monthly = state.activeMonthlyBudgets(now);
    return AppPageListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        if (monthly.isNotEmpty)
          BudgetSummaryCard(
            spent: monthly.fold<double>(0, (sum, budget) => sum + budget.spent),
            limit: monthly.fold<double>(
              0,
              (sum, budget) => sum + budget.amount,
            ),
            currency: currency,
            month: now,
          ),
        for (final budget in state.budgets) ...[
          const SizedBox(height: AppLayout.itemGap),
          BudgetCard(
            budget: budget,
            category: state.categoryFor(budget.categoryId),
            currency: currency,
            pending: state.pendingIds.contains(budget.id),
            now: now,
            onTap: state.pendingIds.contains(budget.id)
                ? null
                : () => onOpen(budget),
          ),
        ],
      ],
    );
  }
}
