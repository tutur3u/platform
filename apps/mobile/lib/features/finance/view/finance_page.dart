import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Card, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/view/transaction_detail_action.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

// ------------------------------------------------------------------
// Helper to reload finance data from the current context
// ------------------------------------------------------------------

void _reload(BuildContext context) {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId != null) {
    unawaited(context.read<FinanceCubit>().loadFinanceData(wsId));
  }
}

class FinancePage extends StatelessWidget {
  const FinancePage({super.key});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => FinanceRepository(),
      child: BlocProvider(
        create: (context) {
          final repository = context.read<FinanceRepository>();
          final cubit = FinanceCubit(
            financeRepository: repository,
          );
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId != null) unawaited(cubit.loadFinanceData(wsId));
          return cubit;
        },
        child: const _FinanceView(),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Error state
// ------------------------------------------------------------------

class _ErrorView extends StatelessWidget {
  const _ErrorView({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.error_outline,
            size: 48,
            color: shad.Theme.of(context).colorScheme.destructive,
          ),
          const shad.Gap(16),
          Text(
            error ?? l10n.financeTitle,
            textAlign: TextAlign.center,
          ),
          const shad.Gap(16),
          shad.SecondaryButton(
            onPressed: () => _reload(context),
            child: Text(l10n.commonRetry),
          ),
        ],
      ),
    );
  }
}

class _FinanceView extends StatelessWidget {
  const _FinanceView();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        MobileSectionAppBar(title: l10n.financeTitle),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            unawaited(
              context.read<FinanceCubit>().loadFinanceData(wsId),
            );
          }
        },
        child: BlocBuilder<FinanceCubit, FinanceState>(
          builder: (context, state) {
            if (state.status == FinanceStatus.loading) {
              return const Center(child: shad.CircularProgressIndicator());
            }

            if (state.status == FinanceStatus.error) {
              return _ErrorView(error: state.error);
            }

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(
                context.deviceClass,
              ),
              child: RefreshIndicator(
                onRefresh: () async => _reload(context),
                child: ListView(
                  padding: const EdgeInsets.only(bottom: 32),
                  children: [
                    // Summary card
                    _SummaryCard(
                      totalBalance: state.totalBalance,
                      workspaceCurrency: state.workspaceCurrency,
                      showApproximateTotal: state.hasCrossCurrencyWallets,
                      walletCount: state.wallets.length,
                      transactionCount: state.recentTransactions.length,
                    ),
                    const shad.Gap(24),
                    // Quick actions
                    _QuickActionsSection(),
                    const shad.Gap(24),
                    // Wallets carousel
                    _WalletsSection(
                      wallets: state.wallets,
                      workspaceCurrency: state.workspaceCurrency,
                      exchangeRates: state.exchangeRates,
                    ),
                    const shad.Gap(24),
                    // Recent transactions
                    _RecentTransactionsSection(
                      transactions: state.recentTransactions,
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Summary Card - Hero section
// ------------------------------------------------------------------

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.totalBalance,
    required this.workspaceCurrency,
    required this.showApproximateTotal,
    required this.walletCount,
    required this.transactionCount,
  });

  final double totalBalance;
  final String workspaceCurrency;
  final bool showApproximateTotal;
  final int walletCount;
  final int transactionCount;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: shad.Card(
        child: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                colorScheme.primary.withValues(alpha: 0.15),
                colorScheme.primary.withValues(alpha: 0.05),
              ],
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: colorScheme.primary.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Icon(
                        Icons.account_balance_wallet,
                        color: colorScheme.primary,
                        size: 28,
                      ),
                    ),
                    const shad.Gap(16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            l10n.financeNetBalance,
                            style: theme.typography.textSmall.copyWith(
                              color: colorScheme.mutedForeground,
                            ),
                          ),
                          const shad.Gap(4),
                          Text(
                            '${showApproximateTotal ? '≈ ' : ''}'
                            '${formatCurrency(
                              totalBalance,
                              workspaceCurrency,
                            )}',
                            style: theme.typography.h3.copyWith(
                              fontWeight: FontWeight.w700,
                              color: colorScheme.foreground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const shad.Gap(16),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _StatPill(
                        icon: Icons.wallet_outlined,
                        label: '$walletCount',
                      ),
                      const shad.Gap(8),
                      _StatPill(
                        icon: Icons.receipt_outlined,
                        label: '$transactionCount',
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatPill extends StatelessWidget {
  const _StatPill({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: colorScheme.background.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: colorScheme.border.withValues(alpha: 0.3),
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 16,
            color: colorScheme.mutedForeground,
          ),
          const shad.Gap(6),
          Text(
            label,
            style: theme.typography.textSmall.copyWith(
              color: colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------------
// Quick Actions Grid
// ------------------------------------------------------------------

class _QuickActionsSection extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    final actions = [
      _QuickAction(
        icon: Icons.swap_horiz,
        label: l10n.financeTransactions,
        route: Routes.transactions,
        color: Colors.blue,
      ),
      _QuickAction(
        icon: Icons.account_balance_wallet,
        label: l10n.financeWallets,
        route: Routes.wallets,
        color: Colors.green,
      ),
      _QuickAction(
        icon: Icons.category,
        label: l10n.financeCategories,
        route: Routes.categories,
        color: Colors.orange,
      ),
    ];

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.financeQuickActions,
            style: shad.Theme.of(context).typography.small.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const shad.Gap(12),
          Row(
            children: actions
                .map(
                  (action) => Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: _QuickActionButton(action: action),
                    ),
                  ),
                )
                .toList(),
          ),
        ],
      ),
    );
  }
}

class _QuickAction {
  const _QuickAction({
    required this.icon,
    required this.label,
    required this.route,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String route;
  final MaterialColor color;
}

class _QuickActionButton extends StatelessWidget {
  const _QuickActionButton({required this.action});

  final _QuickAction action;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    return shad.Card(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push(action.route),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: action.color.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  action.icon,
                  color: action.color,
                  size: 20,
                ),
              ),
              const shad.Gap(6),
              Text(
                action.label,
                style: theme.typography.textSmall.copyWith(
                  fontWeight: FontWeight.w500,
                  color: colorScheme.foreground,
                ),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Recent transactions section
// ------------------------------------------------------------------

class _RecentTransactionsSection extends StatelessWidget {
  const _RecentTransactionsSection({required this.transactions});

  final List<Transaction> transactions;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  l10n.financeRecentTransactions,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              shad.GhostButton(
                onPressed: () => context.push(Routes.transactions),
                child: Text(l10n.financeViewAll),
              ),
            ],
          ),
        ),
        if (transactions.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: shad.Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(
                      Icons.receipt_long_outlined,
                      size: 48,
                      color: theme.colorScheme.mutedForeground.withValues(
                        alpha: 0.5,
                      ),
                    ),
                    const shad.Gap(12),
                    Text(
                      l10n.financeNoTransactions,
                      style: theme.typography.textMuted,
                      textAlign: TextAlign.center,
                    ),
                    const shad.Gap(8),
                    shad.SecondaryButton(
                      onPressed: () => context.push(Routes.transactions),
                      child: Text(l10n.financeAddFirstTransaction),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                for (var i = 0; i < transactions.length && i < 5; i++) ...[
                  _TransactionTile(transactions[i]),
                  if (i < transactions.length - 1 && i < 4) const shad.Gap(2),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _TransactionTile extends StatelessWidget {
  const _TransactionTile(this.tx);

  final Transaction tx;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final amount = tx.amount ?? 0;
    final isExpense = amount < 0;
    final currency = tx.walletCurrency ?? 'USD';

    final hasDescription = tx.description?.isNotEmpty ?? false;
    final title = hasDescription ? tx.description! : (tx.categoryName ?? '');

    final subtitle = [
      if (tx.categoryName != null && hasDescription) tx.categoryName!,
      if (tx.walletName != null) tx.walletName!,
    ].join(' · ');

    final prefix = isExpense ? '' : '+';
    final formatted = formatCurrency(amount, currency);

    return shad.Card(
      padding: EdgeInsets.zero,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () async {
          final wsId = context
              .read<WorkspaceCubit>()
              .state
              .currentWorkspace
              ?.id;
          if (wsId == null) return;

          final financeState = context.read<FinanceCubit>().state;
          final changed = await openTransactionDetailSheet(
            context,
            wsId: wsId,
            transaction: tx,
            repository: context.read<FinanceRepository>(),
            workspaceCurrency: financeState.workspaceCurrency,
            exchangeRates: financeState.exchangeRates,
          );

          if (!context.mounted || !changed) return;
          _reload(context);
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: isExpense
                      ? colorScheme.destructive.withValues(alpha: 0.12)
                      : colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Center(
                  child: Icon(
                    isExpense ? Icons.arrow_downward : Icons.arrow_upward,
                    size: 20,
                    color: isExpense
                        ? colorScheme.destructive
                        : colorScheme.primary,
                  ),
                ),
              ),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.p.copyWith(
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (subtitle.isNotEmpty)
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.textMuted,
                      ),
                  ],
                ),
              ),
              const shad.Gap(12),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(
                    '$prefix$formatted',
                    style: theme.typography.p.copyWith(
                      fontWeight: FontWeight.w600,
                      color: isExpense
                          ? colorScheme.destructive
                          : colorScheme.primary,
                    ),
                  ),
                  if (tx.takenAt != null)
                    Text(
                      DateFormat.yMd(
                        Localizations.localeOf(context).toString(),
                      ).format(tx.takenAt!),
                      style: theme.typography.textSmall.copyWith(
                        color: colorScheme.mutedForeground,
                      ),
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Wallets section — horizontal scrollable cards
// ------------------------------------------------------------------

class _WalletsSection extends StatelessWidget {
  const _WalletsSection({
    required this.wallets,
    required this.workspaceCurrency,
    required this.exchangeRates,
  });

  final List<Wallet> wallets;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  l10n.financeYourWallets,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              shad.GhostButton(
                onPressed: () => context.push(Routes.wallets),
                child: Text(l10n.financeViewAll),
              ),
            ],
          ),
        ),
        if (wallets.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: shad.Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Icon(
                      Icons.account_balance_wallet_outlined,
                      size: 48,
                      color: theme.colorScheme.mutedForeground.withValues(
                        alpha: 0.5,
                      ),
                    ),
                    const shad.Gap(12),
                    Text(
                      l10n.financeNoWallets,
                      style: theme.typography.textMuted,
                      textAlign: TextAlign.center,
                    ),
                    const shad.Gap(8),
                    shad.SecondaryButton(
                      onPressed: () => context.push(Routes.wallets),
                      child: Text(l10n.financeCreateFirstWallet),
                    ),
                  ],
                ),
              ),
            ),
          )
        else
          SizedBox(
            height: responsiveValue(context, compact: 160, medium: 176),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: wallets.length,
              separatorBuilder: (_, _) => const shad.Gap(12),
              itemBuilder: (context, index) => _WalletCard(
                wallet: wallets[index],
                workspaceCurrency: workspaceCurrency,
                exchangeRates: exchangeRates,
                onTap: () =>
                    context.push(Routes.walletDetailPath(wallets[index].id)),
              ),
            ),
          ),
      ],
    );
  }
}

class _WalletCard extends StatelessWidget {
  const _WalletCard({
    required this.wallet,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.onTap,
  });

  final Wallet wallet;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final currency = wallet.currency ?? 'USD';
    final balance = wallet.balance ?? 0;
    final converted = convertCurrency(
      balance,
      currency,
      workspaceCurrency,
      exchangeRates,
    );
    final showConverted =
        currency.toUpperCase() != workspaceCurrency.toUpperCase() &&
        converted != null;

    return SizedBox(
      width: responsiveValue(
        context,
        compact: 170,
        medium: 190,
        expanded: 210,
      ),
      child: shad.Card(
        padding: EdgeInsets.zero,
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  colorScheme.primary.withValues(alpha: 0.08),
                  Colors.transparent,
                ],
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: colorScheme.primary.withValues(alpha: 0.12),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Icon(
                          Icons.account_balance_wallet_outlined,
                          size: 18,
                          color: colorScheme.primary,
                        ),
                      ),
                      const Spacer(),
                      if (showConverted)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 4,
                          ),
                          decoration: BoxDecoration(
                            color: colorScheme.muted.withValues(alpha: 0.3),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            '≈ ${formatCurrency(converted, workspaceCurrency)}',
                            style: theme.typography.xSmall.copyWith(
                              color: colorScheme.mutedForeground,
                            ),
                          ),
                        ),
                    ],
                  ),
                  const Spacer(),
                  Text(
                    wallet.name ?? '',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.textSmall.copyWith(
                      color: colorScheme.mutedForeground,
                    ),
                  ),
                  const shad.Gap(4),
                  Text(
                    formatCurrency(balance, currency),
                    style: theme.typography.h4.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  Text(
                    currency,
                    style: theme.typography.textSmall.copyWith(
                      color: colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
