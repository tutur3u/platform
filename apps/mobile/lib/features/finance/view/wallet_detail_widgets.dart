import 'package:flutter/material.dart' hide Card;
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WalletDetailMetadataCard extends StatelessWidget {
  const WalletDetailMetadataCard({
    required this.wallet,
    required this.workspaceCurrency,
    required this.exchangeRates,
    super.key,
  });

  final Wallet wallet;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isCredit = wallet.type == 'CREDIT';
    final walletCurrency = wallet.currency ?? 'USD';
    final balance = wallet.balance ?? 0;
    final convertedBalance = convertCurrency(
      balance,
      walletCurrency,
      workspaceCurrency,
      exchangeRates,
    );
    final showConverted =
        walletCurrency.toUpperCase() != workspaceCurrency.toUpperCase() &&
        convertedBalance != null;
    final convertedBalanceText = showConverted
        ? '  (≈ ${formatCurrency(convertedBalance, workspaceCurrency)})'
        : '';

    return shad.Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              WalletVisualAvatar(
                icon: wallet.icon,
                imageSrc: wallet.imageSrc,
                fallbackIcon: resolvePlatformIcon(
                  wallet.icon,
                  fallback: isCredit
                      ? Icons.credit_card_outlined
                      : Icons.wallet_outlined,
                ),
              ),
              const shad.Gap(10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      wallet.name ?? '-',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.p.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          if (wallet.description?.trim().isNotEmpty ?? false) ...[
            const shad.Gap(8),
            Text(
              wallet.description!.trim(),
              style: theme.typography.textSmall.copyWith(
                color: colorScheme.mutedForeground,
              ),
            ),
          ],
          const shad.Gap(12),
          _MetaRow(
            label: context.l10n.financeWalletBalance,
            value:
                '${formatCurrency(balance, walletCurrency)}'
                '$convertedBalanceText',
          ),
          const shad.Gap(8),
          _MetaRow(
            label: context.l10n.financeType,
            value: isCredit
                ? context.l10n.financeWalletTypeCredit
                : context.l10n.financeWalletTypeStandard,
          ),
          const shad.Gap(8),
          _MetaRow(
            label: context.l10n.financeWalletCurrency,
            value: walletCurrency,
          ),
        ],
      ),
    );
  }
}

class WalletDetailStatsCard extends StatelessWidget {
  const WalletDetailStatsCard({
    required this.stats,
    required this.workspaceCurrency,
    required this.exchangeRates,
    this.walletCurrency,
    super.key,
  });

  final TransactionStats? stats;
  final String workspaceCurrency;
  final String? walletCurrency;
  final List<ExchangeRate> exchangeRates;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final currentStats =
        stats ??
        const TransactionStats(
          totalTransactions: 0,
          totalIncome: 0,
          totalExpense: 0,
          netTotal: 0,
        );
    final sourceCurrency =
        (currentStats.currency ?? walletCurrency ?? workspaceCurrency)
            .trim()
            .toUpperCase();
    final targetCurrency = workspaceCurrency.trim().toUpperCase();
    final showConverted = sourceCurrency != targetCurrency;

    final convertedIncome = showConverted
        ? convertCurrency(
            currentStats.totalIncome,
            sourceCurrency,
            targetCurrency,
            exchangeRates,
          )
        : currentStats.totalIncome;
    final convertedExpense = showConverted
        ? convertCurrency(
            currentStats.totalExpense,
            sourceCurrency,
            targetCurrency,
            exchangeRates,
          )
        : currentStats.totalExpense;
    final convertedNet = showConverted
        ? convertCurrency(
            currentStats.netTotal,
            sourceCurrency,
            targetCurrency,
            exchangeRates,
          )
        : currentStats.netTotal;

    final approxPrefix = currentStats.hasRedactedAmounts ? '≈ ' : '';
    final walletIncome = formatCurrency(
      currentStats.totalIncome,
      sourceCurrency,
    );
    final walletExpense = formatCurrency(
      currentStats.totalExpense,
      sourceCurrency,
    );
    final walletNet = formatCurrency(currentStats.netTotal, sourceCurrency);
    final incomeText = '$approxPrefix$walletIncome';
    final expenseText = '$approxPrefix$walletExpense';
    final netText = '$approxPrefix$walletNet';

    final convertedIncomeText = convertedIncome == null || !showConverted
        ? null
        : '≈ ${formatCurrency(convertedIncome, targetCurrency)}';
    final convertedExpenseText = convertedExpense == null || !showConverted
        ? null
        : '≈ ${formatCurrency(convertedExpense, targetCurrency)}';
    final convertedNetText = convertedNet == null || !showConverted
        ? null
        : '≈ ${formatCurrency(convertedNet, targetCurrency)}';

    return shad.Card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.financeStatisticsSummary,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w700,
            ),
          ),
          const shad.Gap(12),
          _StatRow(
            label: l10n.financeTotalTransactions,
            value: currentStats.totalTransactions.toString(),
          ),
          const shad.Gap(6),
          _StatRow(
            label: l10n.financeIncome,
            value: incomeText,
            secondaryValue: convertedIncomeText,
            valueColor: Colors.green,
          ),
          const shad.Gap(6),
          _StatRow(
            label: l10n.financeExpense,
            value: expenseText,
            secondaryValue: convertedExpenseText,
            valueColor: theme.colorScheme.destructive,
          ),
          const shad.Gap(6),
          _StatRow(
            label: l10n.financeNet,
            value: netText,
            secondaryValue: convertedNetText,
            valueColor: currentStats.netTotal >= 0
                ? theme.colorScheme.primary
                : theme.colorScheme.destructive,
          ),
        ],
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 100,
          child: Text(
            label,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        const shad.Gap(8),
        Expanded(
          child: Text(
            value,
            style: theme.typography.textSmall,
          ),
        ),
      ],
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({
    required this.label,
    required this.value,
    this.secondaryValue,
    this.valueColor,
  });

  final String label;
  final String value;
  final String? secondaryValue;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            label,
            style: theme.typography.textSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ),
        const shad.Gap(8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              value,
              style: theme.typography.textSmall.copyWith(
                fontWeight: FontWeight.w700,
                color: valueColor,
              ),
            ),
            if (secondaryValue != null)
              Text(
                secondaryValue!,
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                ),
              ),
          ],
        ),
      ],
    );
  }
}
