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

class WalletDetailSummaryCard extends StatelessWidget {
  const WalletDetailSummaryCard({
    required this.wallet,
    required this.stats,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.showAmounts,
    this.onEdit,
    super.key,
  });

  final Wallet wallet;
  final TransactionStats? stats;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final bool showAmounts;
  final VoidCallback? onEdit;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final colorScheme = theme.colorScheme;
    final isCredit = wallet.type == 'CREDIT';
    final walletCurrency = (wallet.currency ?? 'USD').trim().toUpperCase();
    final balance = wallet.balance ?? 0;
    final convertedBalance = convertCurrency(
      balance,
      walletCurrency,
      workspaceCurrency,
      exchangeRates,
    );
    final showConverted =
        walletCurrency != workspaceCurrency.toUpperCase() &&
        convertedBalance != null;
    final currentStats =
        stats ??
        const TransactionStats(
          totalTransactions: 0,
          totalIncome: 0,
          totalExpense: 0,
          netTotal: 0,
        );
    final incomeColor = theme.brightness == Brightness.dark
        ? Colors.green.shade300
        : Colors.green.shade700;

    return FinancePanel(
      backgroundColor: palette.elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
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
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      wallet.name ?? '-',
                      style: theme.typography.large.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (wallet.description?.trim().isNotEmpty ?? false) ...[
                      const shad.Gap(4),
                      Text(
                        wallet.description!.trim(),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.textSmall.copyWith(
                          color: colorScheme.mutedForeground,
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
                  shad.OutlineButton(
                    density: shad.ButtonDensity.icon,
                    onPressed: onEdit,
                    child: const Icon(Icons.edit_outlined, size: 16),
                  ),
                  const shad.Gap(12),
                  FinanceAmountText(
                    amount: balance,
                    currency: walletCurrency,
                    isVisible: showAmounts,
                    showPlus: false,
                    forceColor: colorScheme.foreground,
                    style: theme.typography.h4,
                  ),
                ],
              ),
            ],
          ),
          if (showConverted) ...[
            const shad.Gap(6),
            Align(
              alignment: Alignment.centerRight,
              child: Text(
                maskFinanceValue(
                  '≈ ${formatCurrency(convertedBalance, workspaceCurrency)}',
                  showAmounts: showAmounts,
                ),
                style: theme.typography.textSmall.copyWith(
                  color: colorScheme.mutedForeground,
                ),
              ),
            ),
          ],
          const shad.Gap(12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _WalletSummaryPill(
                label: isCredit
                    ? context.l10n.financeWalletTypeCredit
                    : context.l10n.financeWalletTypeStandard,
                color: isCredit ? palette.negative : palette.accent,
                icon: isCredit
                    ? Icons.credit_card_outlined
                    : Icons.wallet_outlined,
              ),
              _WalletSummaryPill(
                label: walletCurrency,
                color: colorScheme.mutedForeground,
                icon: Icons.currency_exchange_rounded,
              ),
              _WalletSummaryPill(
                label:
                    '${currentStats.totalTransactions} '
                    '${context.l10n.financeTransactionCountShort}',
                color: palette.accent,
                icon: Icons.receipt_long_outlined,
              ),
            ],
          ),
          const shad.Gap(14),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FinanceStatChip(
                icon: Icons.arrow_upward_rounded,
                label: context.l10n.financeIncome,
                value: maskFinanceValue(
                  formatCurrency(currentStats.totalIncome, walletCurrency),
                  showAmounts: showAmounts,
                ),
                tint: incomeColor,
              ),
              FinanceStatChip(
                icon: Icons.arrow_downward_rounded,
                label: context.l10n.financeExpense,
                value: maskFinanceValue(
                  formatCurrency(currentStats.totalExpense, walletCurrency),
                  showAmounts: showAmounts,
                ),
                tint: palette.negative,
              ),
              FinanceStatChip(
                icon: Icons.show_chart_rounded,
                label: context.l10n.financeNet,
                value: maskFinanceValue(
                  formatCurrency(currentStats.netTotal, walletCurrency),
                  showAmounts: showAmounts,
                ),
                tint: currentStats.netTotal >= 0
                    ? palette.positive
                    : palette.negative,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _WalletSummaryPill extends StatelessWidget {
  const _WalletSummaryPill({
    required this.label,
    required this.color,
    required this.icon,
  });

  final String label;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const shad.Gap(6),
          Text(
            label,
            style: theme.typography.xSmall.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}
