import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/utils/currency_conversion.dart';
import 'package:mobile/data/models/finance/exchange_rate.dart';
import 'package:mobile/data/models/finance/transaction_stats.dart';
import 'package:mobile/data/models/finance/wallet.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';

class WalletDetailSummaryCard extends StatelessWidget {
  const WalletDetailSummaryCard({
    required this.wallet,
    required this.stats,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.showAmounts,
    this.onEdit,
    this.onOpenCheckpoints,
    super.key,
  });

  final Wallet wallet;
  final TransactionStats? stats;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final bool showAmounts;
  final VoidCallback? onEdit;
  final VoidCallback? onOpenCheckpoints;

  String _money(double amount, String currency, {bool approximate = false}) =>
      maskFinanceValue(
        formatFinanceAmount(amount, currency, approximate: approximate),
        showAmounts: showAmounts,
      );

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final hiddenAmount = showAmounts ? null : l10n.financeHiddenAmount;
    final isCredit = wallet.type == 'CREDIT';
    final currency = (wallet.currency ?? workspaceCurrency).toUpperCase();
    final balance = wallet.balance ?? 0;
    final converted = currency == workspaceCurrency.toUpperCase()
        ? null
        : convertCurrency(balance, currency, workspaceCurrency, exchangeRates);
    final totals = stats;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      spacing: AppLayout.itemGap,
      children: [
        AppSummaryHero(
          eyebrow: l10n.financeWalletBalance,
          headline: _money(balance, currency),
          headlineSemanticsLabel: hiddenAmount,
          icon: isCredit ? LucideIcons.creditCard : LucideIcons.wallet,
          tone: isCredit ? AppTone.warning : AppTone.primary,
          supporting: wallet.description,
          facts: [
            AppHeroFact(
              label: currency,
              value: isCredit
                  ? l10n.financeWalletTypeCredit
                  : l10n.financeWalletTypeStandard,
            ),
            if (converted != null)
              AppHeroFact(
                label: workspaceCurrency,
                value: _money(converted, workspaceCurrency, approximate: true),
                valueSemanticsLabel: hiddenAmount,
              ),
            if (totals != null)
              AppHeroFact(
                label: l10n.financeTransactionCountShort,
                value: '${totals.totalTransactions}',
              ),
          ],
          actions: [
            if (onEdit != null)
              AppButton.outline(
                onPressed: onEdit,
                leading: const Icon(LucideIcons.pencil),
                child: Text(l10n.financeEditWallet),
              ),
            if (onOpenCheckpoints != null)
              AppButton.outline(
                onPressed: onOpenCheckpoints,
                leading: const Icon(LucideIcons.listChecks),
                child: Text(l10n.financeCheckpointsShortLabel),
              ),
          ],
        ),
        if (totals != null)
          AppAdaptiveGrid(
            minTileWidth: 115,
            equalHeight: true,
            children: [
              AppStatTile(
                label: l10n.financeIncome,
                value: _money(totals.totalIncome, currency),
                valueSemanticsLabel: hiddenAmount,
                icon: LucideIcons.arrowDownLeft,
                tone: AppTone.success,
              ),
              AppStatTile(
                label: l10n.financeExpense,
                value: _money(totals.totalExpense, currency),
                valueSemanticsLabel: hiddenAmount,
                icon: LucideIcons.arrowUpRight,
                tone: AppTone.destructive,
              ),
              AppStatTile(
                label: l10n.financeNet,
                value: _money(totals.netTotal, currency),
                valueSemanticsLabel: hiddenAmount,
                icon: LucideIcons.chartPie,
              ),
            ],
          ),
      ],
    );
  }
}
