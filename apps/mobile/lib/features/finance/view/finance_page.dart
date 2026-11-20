import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_warmup_coordinator.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/finance_permissions.dart';
import 'package:mobile/features/finance/view/finance_invoices_sheet.dart';
import 'package:mobile/features/finance/view/finance_overview_balances.dart';
import 'package:mobile/features/finance/view/finance_overview_month.dart';
import 'package:mobile/features/finance/view/finance_reports_sheet.dart';
import 'package:mobile/features/finance/view/recurring_transactions_sheet.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/finance/widgets/finance_budget_alerts.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/features/finance/widgets/finance_shell_actions.dart';
import 'package:mobile/features/finance/widgets/finance_states.dart';
import 'package:mobile/features/finance/widgets/finance_transaction_groups.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

/// Recent transactions shown on the overview.
const financeOverviewRecentCount = 6;

class FinanceOverviewSkeleton extends StatelessWidget {
  const FinanceOverviewSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const AppPageListView(
    children: [
      FinanceSkeleton(height: 136),
      SizedBox(height: AppLayout.sectionGap),
      FinanceSkeleton(height: 92),
      SizedBox(height: AppLayout.sectionGap),
      AppSkeletonRows(count: 4),
    ],
  );
}

Future<void> _reload(BuildContext context, {bool retainError = false}) async {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId != null) {
    await context.read<FinanceCubit>().loadFinanceData(
      wsId,
      forceRefresh: true,
      retainError: retainError,
    );
  }
}

class FinancePage extends StatelessWidget {
  const FinancePage({this.repository, super.key});

  final FinanceRepository? repository;

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => repository ?? FinanceRepository(),
      child: BlocProvider(
        create: (context) {
          final cubit = FinanceCubit(
            financeRepository: context.read<FinanceRepository>(),
          );
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId != null) {
            unawaited(cubit.loadFinanceData(wsId));
          }
          unawaited(CacheWarmupCoordinator.instance.prewarmModule('finance'));
          return cubit;
        },
        child: const _FinanceView(),
      ),
    );
  }
}

class _FinanceView extends StatelessWidget {
  const _FinanceView();

  @override
  Widget build(BuildContext context) {
    final showAmounts = financeAmountsVisible(context);
    const location = Routes.finance;
    final title = context.l10n.navFinance;
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (prev, curr) =>
          prev.currentWorkspace?.id != curr.currentWorkspace?.id,
      listener: (context, state) {
        final wsId = state.currentWorkspace?.id;
        if (wsId != null) {
          unawaited(context.read<FinanceCubit>().loadFinanceData(wsId));
        }
      },
      child: BlocBuilder<FinanceCubit, FinanceState>(
        builder: (context, state) => Stack(
          fit: StackFit.expand,
          children: [
            ShellTitleOverride(
              ownerId: location,
              locations: const {location},
              title: title,
              showLeadingBrand: false,
              showAvatar: false,
            ),
            ShellChromeActions(
              ownerId: location,
              locations: const {location},
              actions: [
                ShellActionSpec(
                  id: 'finance-search',
                  icon: AppIcons.search,
                  tooltip: context.l10n.commonSearch,
                  onPressed: () =>
                      context.push('${Routes.transactions}?search=1'),
                ),
                financeAmountVisibilityAction(
                  context,
                  showAmounts: showAmounts,
                ),
                if (canManageFinance(context, 'create_transactions'))
                  financeCreateAction(
                    id: 'finance-create',
                    tooltip: context.l10n.financeNewTransaction,
                    onPressed: () => unawaited(_create(context, state)),
                  ),
              ],
            ),
            _body(context, state),
          ],
        ),
      ),
    );
  }

  Widget _body(BuildContext context, FinanceState state) {
    if (state.status == FinanceStatus.error) {
      return NovaRefreshIndicator.state(
        onRefresh: () => _reload(context, retainError: true),
        child: FinanceProblemView(
          problem: FinanceProblem.error,
          message: state.error,
          onRetry: () => unawaited(_reload(context)),
        ),
      );
    }
    if (state.status == FinanceStatus.loading || !state.hasWorkspaceCurrency) {
      return const FinanceOverviewSkeleton();
    }
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    return NovaRefreshIndicator(
      onRefresh: () => _reload(context, retainError: true),
      child: FinanceOverviewContent(
        state: state,
        budgetAlerts:
            wsId != null && canManageFinance(context, 'manage_finance')
            ? FinanceBudgetAlerts(
                workspaceId: wsId,
                repository: context.read<FinanceRepository>(),
                revision: state.lastUpdatedAt?.millisecondsSinceEpoch ?? 0,
              )
            : null,
        onTransactionTap: (transaction) =>
            _openTransaction(context, state, transaction),
        onInvoices: canManageFinance(context, 'view_invoices')
            ? () => unawaited(
                openFinanceInvoices(
                  context,
                  wallets: state.wallets,
                  currency: state.workspaceCurrency,
                ),
              )
            : null,
        onReports:
            state.wallets.isNotEmpty &&
                canManageFinance(context, 'view_finance_stats')
            ? () => unawaited(
                openFinanceReports(
                  context,
                  wallets: state.wallets,
                  currency: state.workspaceCurrency,
                  exchangeRates: state.exchangeRates,
                ),
              )
            : null,
        onRecurring: () => unawaited(
          openRecurringTransactionsSheet(
            context,
            currency: state.workspaceCurrency,
          ),
        ),
        onCreate: canManageFinance(context, 'create_transactions')
            ? () => _create(context, state)
            : null,
      ),
    );
  }
}

/// Overview body: balances, this month's flow and recent activity. Phone
/// stacks them; wider layouts put recent activity in a second column.
class FinanceOverviewContent extends StatelessWidget {
  const FinanceOverviewContent({
    required this.state,
    required this.onTransactionTap,
    required this.onCreate,
    this.onRecurring,
    this.onInvoices,
    this.onReports,
    this.budgetAlerts,
    this.now,
    super.key,
  });

  final FinanceState state;
  final VoidCallback? onRecurring;
  final VoidCallback? onInvoices;
  final VoidCallback? onReports;

  /// Banner for budgets over or close to their limit, when the person can
  /// manage budgets.
  final Widget? budgetAlerts;
  final ValueChanged<Transaction> onTransactionTap;
  final VoidCallback? onCreate;

  /// Reference time for the month heading and day labels; defaults to now.
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final today = now ?? DateTime.now();
    return LayoutBuilder(
      builder: (context, constraints) {
        final balances = state.wallets.isEmpty
            ? AppStateMessage(
                icon: LucideIcons.wallet,
                illustration: const AppIllustration(AppIllustrationKind.wallet),
                title: l10n.financeNoWallets,
                message: l10n.financeOverviewNoWalletsBody,
                actionLabel: l10n.financeCreateFirstWallet,
                onAction: () => context.go(Routes.wallets),
              )
            : FinanceBalanceStrip(state: state);
        final month = FinanceMonthSummary(
          flow: state.monthFlow,
          month: today,
          loading: state.isLoadingMonthFlow,
        );
        final recent = _Recent(
          state: state,
          now: today,
          onTransactionTap: onTransactionTap,
          onCreate: onCreate,
        );
        final wide =
            Breakpoints.fromWidth(constraints.maxWidth) != DeviceClass.compact;
        return CustomScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          slivers: [
            if (state.wallets.isEmpty)
              SliverAppPage(
                kind: AppPageKind.root,
                includeBottom: false,
                sliver: SliverToBoxAdapter(child: balances),
              )
            else ...[
              const SliverToBoxAdapter(
                child: SizedBox(height: AppLayout.pageTop),
              ),
              SliverToBoxAdapter(child: balances),
            ],
            SliverAppPage(
              kind: AppPageKind.root,
              includeTop: false,
              sliver: SliverList.list(
                children: [
                  if (budgetAlerts case final alerts?) ...[
                    const SizedBox(height: AppLayout.itemGap),
                    alerts,
                  ],
                  if (state.wallets.isNotEmpty ||
                      onRecurring != null ||
                      onInvoices != null) ...[
                    const SizedBox(height: AppLayout.itemGap),
                    AppGroupedCard(
                      children: [
                        if (state.wallets.isNotEmpty)
                          AppRichRow(
                            key: const ValueKey('finance-overview-checkpoints'),
                            title: l10n.financeCheckpointsBatchRecord,
                            leading: const AppIconTile(
                              icon: LucideIcons.listChecks,
                            ),
                            onTap: () =>
                                context.push(Routes.financeCheckpoints),
                          ),
                        if (onInvoices != null)
                          AppRichRow(
                            title: l10n.financeInvoices,
                            leading: const AppIconTile(
                              icon: LucideIcons.receipt,
                            ),
                            onTap: onInvoices,
                          ),
                        if (onReports != null)
                          AppRichRow(
                            title: l10n.financeReports,
                            leading: const AppIconTile(
                              icon: LucideIcons.chartNoAxesColumn,
                            ),
                            onTap: onReports,
                          ),
                        if (onRecurring != null)
                          AppRichRow(
                            key: const ValueKey('finance-overview-recurring'),
                            title: l10n.financeRecurring,
                            leading: const AppIconTile(
                              icon: LucideIcons.repeat,
                            ),
                            onTap: onRecurring,
                          ),
                      ],
                    ),
                  ],
                  const SizedBox(height: AppLayout.sectionGap),
                  if (wide)
                    Row(
                      spacing: AppLayout.sectionGap,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(child: month),
                        Expanded(child: recent),
                      ],
                    )
                  else ...[
                    month,
                    const SizedBox(height: AppLayout.sectionGap),
                    recent,
                  ],
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _Recent extends StatelessWidget {
  const _Recent({
    required this.state,
    required this.now,
    required this.onTransactionTap,
    required this.onCreate,
  });

  final FinanceState state;
  final DateTime now;
  final ValueChanged<Transaction> onTransactionTap;
  final VoidCallback? onCreate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(
          title: l10n.financeRecent,
          actionLabel: l10n.financeAll,
          onAction: () => context.go(Routes.transactions),
          padding: EdgeInsets.zero,
        ),
        if (state.recentTransactions.isEmpty)
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.md),
            child: AppStateMessage(
              icon: LucideIcons.receipt,
              illustration: const AppIllustration(
                AppIllustrationKind.noTransactions,
              ),
              title: l10n.financeNoTransactions,
              message: l10n.financeOverviewNoTransactionsBody,
              actionLabel: l10n.financeAddFirstTransaction,
              onAction: onCreate,
            ),
          )
        else
          FinanceTransactionGroups(
            transactions: state.recentTransactions
                .take(financeOverviewRecentCount)
                .toList(growable: false),
            fallbackCurrency: state.workspaceCurrency,
            onTap: onTransactionTap,
            showNet: true,
            now: now,
          ),
      ],
    );
  }
}

Future<void> _create(BuildContext context, FinanceState state) async {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId == null) return;
  final created = await openCreateTransactionSheet(
    context,
    wsId: wsId,
    repository: context.read<FinanceRepository>(),
    exchangeRates: state.exchangeRates,
  );
  if (!created || !context.mounted) return;
  showAppToast(context, message: context.l10n.financeTransactionSaved);
  await _reload(context, retainError: true);
}

Future<void> _openTransaction(
  BuildContext context,
  FinanceState state,
  Transaction transaction,
) async {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId == null) return;
  final changed = await openTransactionDetailSheet(
    context,
    wsId: wsId,
    transaction: transaction,
    repository: context.read<FinanceRepository>(),
    workspaceCurrency: state.workspaceCurrency,
    exchangeRates: state.exchangeRates,
  );
  if (context.mounted &&
      changed &&
      context.read<WorkspaceCubit>().state.currentWorkspace?.id == wsId) {
    await _reload(context);
  }
}
