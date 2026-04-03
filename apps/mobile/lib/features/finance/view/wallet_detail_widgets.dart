import 'package:flutter/material.dart' hide Card;
import 'package:mobile/core/icons/platform_icon.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/finance/widgets/wallet_visual_avatar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class WalletDetailMetadataCard extends StatelessWidget {
  const WalletDetailMetadataCard({
    required this.wallet,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.showAmounts,
    this.onEdit,
    super.key,
  });

  final Wallet wallet;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final bool showAmounts;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final palette = FinancePalette.of(context);
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

    return FinancePanel(
      backgroundColor: palette.elevatedPanel,
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
                    FinanceSectionHeader(
                      title: wallet.name ?? '-',
                      action: shad.OutlineButton(
                        density: shad.ButtonDensity.icon,
                        onPressed: onEdit,
                        child: const Icon(Icons.edit_outlined, size: 16),
                      ),
                    ),
                    const shad.Gap(6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: (isCredit ? palette.negative : palette.accent)
                            .withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        isCredit
                            ? context.l10n.financeWalletTypeCredit
                            : context.l10n.financeWalletTypeStandard,
                        style: theme.typography.xSmall.copyWith(
                          color: isCredit ? palette.negative : palette.accent,
                          fontWeight: FontWeight.w700,
                        ),
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
          FinanceAmountText(
            amount: balance,
            currency: walletCurrency,
            isVisible: showAmounts,
            showPlus: false,
            alignment: CrossAxisAlignment.start,
            forceColor: theme.colorScheme.foreground,
            style: theme.typography.h3,
          ),
          if (showConverted) ...[
            const shad.Gap(6),
            Text(
              maskFinanceValue(
                '≈ ${formatCurrency(convertedBalance, workspaceCurrency)}',
                showAmounts: showAmounts,
              ),
              style: theme.typography.textSmall.copyWith(
                color: colorScheme.mutedForeground,
              ),
            ),
          ],
          const shad.Gap(16),
          FinanceKeyValueRow(
            label: context.l10n.financeWalletBalance,
            value: maskFinanceValue(
              '${formatCurrency(balance, walletCurrency)}'
              '$convertedBalanceText',
              showAmounts: showAmounts,
            ),
          ),
          const shad.Gap(8),
          FinanceKeyValueRow(
            label: context.l10n.financeType,
            value: isCredit
                ? context.l10n.financeWalletTypeCredit
                : context.l10n.financeWalletTypeStandard,
          ),
          const shad.Gap(8),
          FinanceKeyValueRow(
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
    required this.showAmounts,
    this.walletCurrency,
    super.key,
  });

  final TransactionStats? stats;
  final String workspaceCurrency;
  final String? walletCurrency;
  final List<ExchangeRate> exchangeRates;
  final bool showAmounts;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final materialTheme = Theme.of(context);
    final palette = FinancePalette.of(context);
    final incomeColor = materialTheme.brightness == Brightness.dark
        ? Colors.green.shade300
        : Colors.green.shade700;
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

    return FinancePanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.financeStatisticsSummary,
            style: theme.typography.large.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const shad.Gap(12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              FinanceStatChip(
                icon: Icons.receipt_long_outlined,
                label: l10n.financeTotalTransactions,
                value: currentStats.totalTransactions.toString(),
                tint: palette.accent,
              ),
              FinanceStatChip(
                icon: Icons.arrow_upward_rounded,
                label: l10n.financeIncome,
                value: maskFinanceValue(
                  incomeText,
                  showAmounts: showAmounts,
                ),
                tint: incomeColor,
              ),
              FinanceStatChip(
                icon: Icons.arrow_downward_rounded,
                label: l10n.financeExpense,
                value: maskFinanceValue(
                  expenseText,
                  showAmounts: showAmounts,
                ),
                tint: theme.colorScheme.destructive,
              ),
            ],
          ),
          const shad.Gap(16),
          _StatRow(
            label: l10n.financeIncome,
            value: maskFinanceValue(
              incomeText,
              showAmounts: showAmounts,
            ),
            secondaryValue: convertedIncomeText == null
                ? null
                : maskFinanceValue(
                    convertedIncomeText,
                    showAmounts: showAmounts,
                  ),
            valueColor: incomeColor,
          ),
          const shad.Gap(8),
          _StatRow(
            label: l10n.financeExpense,
            value: maskFinanceValue(
              expenseText,
              showAmounts: showAmounts,
            ),
            secondaryValue: convertedExpenseText == null
                ? null
                : maskFinanceValue(
                    convertedExpenseText,
                    showAmounts: showAmounts,
                  ),
            valueColor: theme.colorScheme.destructive,
          ),
          const shad.Gap(8),
          _StatRow(
            label: l10n.financeNet,
            value: maskFinanceValue(
              netText,
              showAmounts: showAmounts,
            ),
            secondaryValue: convertedNetText == null
                ? null
                : maskFinanceValue(
                    convertedNetText,
                    showAmounts: showAmounts,
                  ),
            valueColor: currentStats.netTotal >= 0
                ? theme.colorScheme.primary
                : theme.colorScheme.destructive,
          ),
        ],
      ),
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
