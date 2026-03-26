import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
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
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<void> _reload(BuildContext context) async {
  final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
  if (wsId != null) {
    await context.read<FinanceCubit>().loadFinanceData(
      wsId,
      forceRefresh: true,
    );
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
    final l10n = context.l10n;

    return shad.Scaffold(
      headers: [
        MobileSectionAppBar(
          title: l10n.financeTitle,
          actions: [
            shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: () => context.push(Routes.transactions),
              child: const Icon(Icons.timeline_rounded, size: 18),
            ),
          ],
        ),
      ],
      child: BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (prev, curr) =>
            prev.currentWorkspace?.id != curr.currentWorkspace?.id,
        listener: (context, state) {
          final wsId = state.currentWorkspace?.id;
          if (wsId != null) {
            unawaited(context.read<FinanceCubit>().loadFinanceData(wsId));
          }
        },
        child: BlocBuilder<FinanceCubit, FinanceState>(
          builder: (context, state) {
            if (state.status == FinanceStatus.loading) {
              return const Center(child: shad.CircularProgressIndicator());
            }

            if (state.status == FinanceStatus.error) {
              return _FinanceError(error: state.error);
            }

            return ResponsiveWrapper(
              maxWidth: ResponsivePadding.maxContentWidth(
                context.deviceClass,
              ),
              child: RefreshIndicator(
                onRefresh: () => _reload(context),
                child: ListView(
                  padding: EdgeInsets.fromLTRB(
                    16,
                    8,
                    16,
                    28 + MediaQuery.paddingOf(context).bottom,
                  ),
                  children: [
                    _OverviewHero(state: state),
                    const shad.Gap(24),
                    _ActionStrip(state: state),
                    const shad.Gap(28),
                    _WalletHighlights(state: state),
                    const shad.Gap(28),
                    _ActivityPreview(state: state),
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

class _FinanceError extends StatelessWidget {
  const _FinanceError({this.error});

  final String? error;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: FinanceEmptyState(
          icon: Icons.error_outline,
          title: l10n.commonSomethingWentWrong,
          body: error ?? l10n.financeTitle,
          action: shad.SecondaryButton(
            onPressed: () => _reload(context),
            child: Text(l10n.commonRetry),
          ),
        ),
      ),
    );
  }
}

class _OverviewHero extends StatelessWidget {
  const _OverviewHero({required this.state});

  final FinanceState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);
    final walletCount = state.wallets.length;
    final txCount = state.recentTransactions.length;

    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: palette.subtleBorder),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: palette.heroGradient,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(
              alpha: theme.brightness == Brightness.dark ? 0.22 : 0.06,
            ),
            blurRadius: 28,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: palette.accent.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(
                  Icons.account_balance_wallet_rounded,
                  size: 26,
                  color: palette.accent,
                ),
              ),
              const shad.Gap(14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      l10n.financeOverviewEyebrow,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      l10n.financeNetBalance,
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const shad.Gap(22),
          Text(
            '${state.hasCrossCurrencyWallets ? '≈ ' : ''}'
            '${formatCurrency(
              state.totalBalance,
              state.workspaceCurrency,
            )}',
            style: theme.typography.h2.copyWith(
              fontWeight: FontWeight.w900,
              height: 1.05,
            ),
          ),
          const shad.Gap(8),
          Text(
            state.hasCrossCurrencyWallets
                ? l10n.financeOverviewCrossCurrencyHint(
                    state.workspaceCurrency.toUpperCase(),
                  )
                : l10n.financeOverviewSingleCurrencyHint(
                    state.workspaceCurrency.toUpperCase(),
                  ),
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(18),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FinanceStatChip(
                icon: Icons.account_balance_wallet_outlined,
                label: l10n.financeWallets,
                value: '$walletCount',
              ),
              FinanceStatChip(
                icon: Icons.receipt_long_outlined,
                label: l10n.financeTransactions,
                value: '$txCount',
                tint: palette.positive,
              ),
              FinanceStatChip(
                icon: Icons.currency_exchange_rounded,
                label: l10n.financeWalletCurrency,
                value: state.workspaceCurrency.toUpperCase(),
                tint: palette.accent,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ActionStrip extends StatelessWidget {
  const _ActionStrip({required this.state});

  final FinanceState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final isCompact = context.isCompact;
    final cards = [
      _ActionCard(
        icon: Icons.add_circle_outline_rounded,
        title: l10n.financeCreateTransaction,
        subtitle: l10n.financeOverviewCreateTransactionHint,
        onTap: () => _createTransaction(context),
      ),
      _ActionCard(
        icon: Icons.account_balance_wallet_outlined,
        title: l10n.financeWallets,
        subtitle: l10n.financeOverviewWalletsHint,
        onTap: () => context.push(Routes.wallets),
      ),
      _ActionCard(
        icon: Icons.dashboard_customize_outlined,
        title: l10n.financeManageLabel,
        subtitle: l10n.financeOverviewManageHint,
        onTap: () => context.push(Routes.categories),
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FinanceSectionHeader(
          title: l10n.financeQuickActions,
          subtitle: l10n.financeOverviewActionsSubtitle,
        ),
        const shad.Gap(14),
        if (isCompact)
          Column(
            children: [
              for (var i = 0; i < cards.length; i++) ...[
                SizedBox(width: double.infinity, child: cards[i]),
                if (i != cards.length - 1) const shad.Gap(12),
              ],
            ],
          )
        else
          Row(
            children: [
              for (var i = 0; i < cards.length; i++) ...[
                Expanded(child: cards[i]),
                if (i != cards.length - 1) const shad.Gap(12),
              ],
            ],
          ),
      ],
    );
  }

  Future<void> _createTransaction(BuildContext context) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) {
      return;
    }

    final created = await openCreateTransactionSheet(
      context,
      wsId: wsId,
      repository: context.read<FinanceRepository>(),
      exchangeRates: state.exchangeRates,
    );

    if (!context.mounted || !created) {
      return;
    }

    await _reload(context);
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);

    return FinancePanel(
      onTap: onTap,
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: palette.accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: palette.accent),
          ),
          const shad.Gap(18),
          Text(
            title,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const shad.Gap(4),
          Text(
            subtitle,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _WalletHighlights extends StatelessWidget {
  const _WalletHighlights({required this.state});

  final FinanceState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FinanceSectionHeader(
          title: l10n.financeOverviewWalletSectionTitle,
          subtitle: l10n.financeOverviewWalletSectionSubtitle,
          action: shad.GhostButton(
            onPressed: () => context.push(Routes.wallets),
            child: Text(l10n.financeViewAll),
          ),
        ),
        const shad.Gap(14),
        if (state.wallets.isEmpty)
          FinanceEmptyState(
            icon: Icons.account_balance_wallet_outlined,
            title: l10n.financeNoWallets,
            body: l10n.financeOverviewNoWalletsBody,
            action: shad.SecondaryButton(
              onPressed: () => context.push(Routes.wallets),
              child: Text(l10n.financeCreateFirstWallet),
            ),
          )
        else
          SizedBox(
            height: 236,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: state.wallets.length,
              separatorBuilder: (_, _) => const shad.Gap(12),
              itemBuilder: (context, index) {
                return _WalletHighlightCard(
                  wallet: state.wallets[index],
                  workspaceCurrency: state.workspaceCurrency,
                  exchangeRates: state.exchangeRates,
                );
              },
            ),
          ),
      ],
    );
  }
}

class _WalletHighlightCard extends StatelessWidget {
  const _WalletHighlightCard({
    required this.wallet,
    required this.workspaceCurrency,
    required this.exchangeRates,
  });

  final Wallet wallet;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);
    final isCredit = wallet.type == 'CREDIT';
    final accent = isCredit ? palette.negative : palette.accent;
    final balance = wallet.balance ?? 0;
    final currency = wallet.currency ?? workspaceCurrency;
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
      width: 224,
      child: FinancePanel(
        onTap: () => context.push(Routes.walletDetailPath(wallet.id)),
        backgroundColor: palette.panel,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                WalletVisualAvatar(
                  icon: wallet.icon,
                  imageSrc: wallet.imageSrc,
                  fallbackIcon: isCredit
                      ? Icons.credit_card_outlined
                      : Icons.account_balance_wallet_outlined,
                  backgroundColor: accent.withValues(alpha: 0.12),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 10,
                    vertical: 6,
                  ),
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    isCredit
                        ? context.l10n.financeWalletTypeCredit
                        : context.l10n.financeWalletTypeStandard,
                    style: theme.typography.xSmall.copyWith(
                      color: accent,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
            const Spacer(),
            Text(
              wallet.name ?? '-',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.large.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            if (wallet.description?.trim().isNotEmpty ?? false) ...[
              const shad.Gap(6),
              Text(
                wallet.description!,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.textSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ] else
              const shad.Gap(16),
            const shad.Gap(16),
            FinanceAmountText(
              amount: balance,
              currency: currency,
              showPlus: false,
              alignment: CrossAxisAlignment.start,
              forceColor: theme.colorScheme.foreground,
              style: theme.typography.h4,
            ),
            if (showConverted) ...[
              const shad.Gap(8),
              Text(
                '≈ ${formatCurrency(converted, workspaceCurrency)}',
                style: theme.typography.textSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ActivityPreview extends StatelessWidget {
  const _ActivityPreview({required this.state});

  final FinanceState state;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        FinanceSectionHeader(
          title: l10n.financeOverviewActivityTitle,
          subtitle: l10n.financeOverviewActivitySubtitle,
          action: shad.GhostButton(
            onPressed: () => context.push(Routes.transactions),
            child: Text(l10n.financeViewAll),
          ),
        ),
        const shad.Gap(14),
        if (state.recentTransactions.isEmpty)
          FinanceEmptyState(
            icon: Icons.receipt_long_outlined,
            title: l10n.financeNoTransactions,
            body: l10n.financeOverviewNoTransactionsBody,
            action: shad.SecondaryButton(
              onPressed: () => context.push(Routes.transactions),
              child: Text(l10n.financeAddFirstTransaction),
            ),
          )
        else
          Column(
            children: [
              for (final transaction in state.recentTransactions.take(5)) ...[
                _ActivityTile(
                  transaction: transaction,
                  workspaceCurrency: state.workspaceCurrency,
                  exchangeRates: state.exchangeRates,
                ),
                if (transaction != state.recentTransactions.take(5).last)
                  const shad.Gap(10),
              ],
            ],
          ),
      ],
    );
  }
}

class _ActivityTile extends StatelessWidget {
  const _ActivityTile({
    required this.transaction,
    required this.workspaceCurrency,
    required this.exchangeRates,
  });

  final Transaction transaction;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final amount = transaction.amount ?? 0;
    final isExpense = amount < 0;
    final accent = isExpense ? palette.negative : palette.positive;
    final title = (transaction.description?.trim().isNotEmpty ?? false)
        ? transaction.description!.trim()
        : (transaction.categoryName ?? transaction.walletName ?? '—');
    final currency = transaction.walletCurrency ?? workspaceCurrency;
    final converted = convertCurrency(
      amount,
      currency,
      workspaceCurrency,
      exchangeRates,
    );
    final showConverted =
        converted != null &&
        currency.toUpperCase() != workspaceCurrency.toUpperCase();
    final subtitle = [
      if (transaction.categoryName?.trim().isNotEmpty ?? false)
        transaction.categoryName!.trim(),
      if (transaction.walletName?.trim().isNotEmpty ?? false)
        transaction.walletName!.trim(),
    ].join(' · ');
    final date = transaction.takenAt ?? transaction.createdAt;

    return FinancePanel(
      radius: 20,
      onTap: () async {
        final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
        if (wsId == null) {
          return;
        }

        final changed = await openTransactionDetailSheet(
          context,
          wsId: wsId,
          transaction: transaction,
          repository: context.read<FinanceRepository>(),
          workspaceCurrency: workspaceCurrency,
          exchangeRates: exchangeRates,
        );

        if (!context.mounted || !changed) {
          return;
        }

        await _reload(context);
      },
      child: Row(
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(
              isExpense ? Icons.south_west_rounded : Icons.north_east_rounded,
              color: accent,
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
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (subtitle.isNotEmpty) ...[
                  const shad.Gap(4),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.textSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
                if (date != null) ...[
                  const shad.Gap(4),
                  Text(
                    DateFormat.yMMMd().format(date),
                    style: theme.typography.xSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const shad.Gap(12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              FinanceAmountText(
                amount: amount,
                currency: currency,
                style: theme.typography.small,
              ),
              if (showConverted) ...[
                const shad.Gap(4),
                Text(
                  '≈ ${formatCurrency(converted, workspaceCurrency)}',
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}
