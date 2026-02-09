import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold, AppBar, Card;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/transaction.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class FinancePage extends StatelessWidget {
  const FinancePage({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (context) {
        final cubit = FinanceCubit(
          financeRepository: FinanceRepository(),
        );
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        if (wsId != null) unawaited(cubit.loadFinanceData(wsId));
        return cubit;
      },
      child: const _FinanceView(),
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
        shad.AppBar(title: Text(l10n.financeTitle)),
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

            return RefreshIndicator(
              onRefresh: () async => _reload(context),
              child: ListView(
                padding: const EdgeInsets.only(bottom: 32),
                children: [
                  _WalletsSection(wallets: state.wallets),
                  const shad.Gap(8),
                  _RecentTransactionsSection(
                    transactions: state.recentTransactions,
                  ),
                ],
              ),
            );
          },
        ),
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

// ------------------------------------------------------------------
// Wallets section — horizontal scrollable cards
// ------------------------------------------------------------------

class _WalletsSection extends StatelessWidget {
  const _WalletsSection({required this.wallets});

  final List<Wallet> wallets;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: Text(
            l10n.financeWallets,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        if (wallets.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              l10n.financeNoWallets,
              style: theme.typography.textMuted,
            ),
          )
        else
          SizedBox(
            height: 120,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: wallets.length,
              separatorBuilder: (_, _) => const shad.Gap(12),
              itemBuilder: (context, index) =>
                  _WalletCard(wallet: wallets[index]),
            ),
          ),
      ],
    );
  }
}

class _WalletCard extends StatelessWidget {
  const _WalletCard({required this.wallet});

  final Wallet wallet;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final currency = wallet.currency ?? 'USD';
    final balance = wallet.balance ?? 0;

    return SizedBox(
      width: 180,
      child: shad.Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Icon(
                    Icons.account_balance_wallet_outlined,
                    size: 18,
                    color: colorScheme.primary,
                  ),
                  const shad.Gap(8),
                  Expanded(
                    child: Text(
                      wallet.name ?? '',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall,
                    ),
                  ),
                ],
              ),
              const Spacer(),
              Text(
                formatCurrency(balance, currency),
                style: theme.typography.p.copyWith(
                  fontWeight: FontWeight.w600,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const shad.Gap(2),
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
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
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
            child: Text(
              l10n.financeNoTransactions,
              style: theme.typography.textMuted,
            ),
          )
        else
          ...transactions.map(_TransactionTile.new),
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
    ].join(' \u00b7 ');

    final prefix = isExpense ? '' : '+';
    final formatted = formatCurrency(amount, currency);

    return shad.GhostButton(
      onPressed: () {},
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: isExpense
                    ? colorScheme.destructive.withValues(alpha: 0.12)
                    : colorScheme.primary.withValues(alpha: 0.12),
                shape: BoxShape.circle,
              ),
              child: Icon(
                isExpense ? Icons.arrow_downward : Icons.arrow_upward,
                size: 18,
                color: isExpense ? colorScheme.destructive : colorScheme.primary,
              ),
            ),
            const shad.Gap(16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.p,
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
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '$prefix$formatted',
                  style: theme.typography.p.copyWith(
                    fontWeight: FontWeight.w600,
                    color: isExpense ? colorScheme.destructive : colorScheme.primary,
                  ),
                ),
                if (tx.takenAt != null)
                  Text(
                    '${tx.takenAt!.month}/${tx.takenAt!.day}',
                    style: theme.typography.textSmall.copyWith(
                      color: colorScheme.mutedForeground,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ------------------------------------------------------------------
// Helper to reload finance data from the current context
// ------------------------------------------------------------------

void _reload(BuildContext context) {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId != null) {
    unawaited(context.read<FinanceCubit>().loadFinanceData(wsId));
  }
}

