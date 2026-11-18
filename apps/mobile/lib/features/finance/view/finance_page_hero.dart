part of 'finance_page.dart';

class _OverviewHero extends StatelessWidget {
  const _OverviewHero({
    required this.state,
    required this.showAmounts,
    required this.now,
  });

  final FinanceState state;
  final bool showAmounts;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final type = context.tokens.typography;
    final currency = state.workspaceCurrency;
    final month = DateFormat.MMM(
      Localizations.localeOf(context).toString(),
    ).format(now);
    var income = 0.0;
    var expense = 0.0;
    for (final transaction in state.recentTransactions) {
      final date = (transaction.takenAt ?? transaction.createdAt)?.toLocal();
      final amount = transaction.amount;
      if (transaction.isTransfer ||
          amount == null ||
          date?.month != now.month ||
          date?.year != now.year) {
        continue;
      }
      final converted = convertCurrency(
        amount,
        transaction.walletCurrency ?? currency,
        currency,
        state.exchangeRates,
      );
      if (converted == null) continue;
      if (converted >= 0) {
        income += converted;
      } else {
        expense += converted;
      }
    }

    return AppCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            context.l10n.financeTotalInCurrency(currency),
            style: type.caption.copyWith(
              color: context.tokens.colorScheme.mutedForeground,
            ),
          ),
          const SizedBox(height: 4),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: AlignmentDirectional.centerStart,
            child: Text(
              maskFinanceValue(
                '${state.hasCrossCurrencyWallets ? '≈ ' : ''}'
                '${formatCurrency(state.totalBalance, currency)}',
                showAmounts: showAmounts,
              ),
              style: type.numeric.copyWith(
                fontSize: 32,
                height: 38 / 32,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const SizedBox(height: 16),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  child: _FlowTile(
                    label: context.l10n.financeRecentIn(month),
                    value: _overviewAmount(income, currency, showAmounts),
                    tone: FinanceTone.income,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _FlowTile(
                    label: context.l10n.financeRecentOut(month),
                    value: _overviewAmount(expense, currency, showAmounts),
                    tone: FinanceTone.expense,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

String _overviewAmount(
  double amount,
  String currency,
  bool showAmounts, {
  bool signed = true,
}) {
  final prefix = amount < 0 ? '−' : (signed && amount > 0 ? '+' : '');
  return maskFinanceValue(
    '$prefix${formatCurrency(amount.abs(), currency)}',
    showAmounts: showAmounts,
  );
}

class _FlowTile extends StatelessWidget {
  const _FlowTile({
    required this.label,
    required this.value,
    required this.tone,
  });

  final String label;
  final String value;
  final FinanceTone tone;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final colors = tone.colors(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.fill,
        borderRadius: tokens.borderRadiusMd,
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              label,
              style: tokens.typography.caption.copyWith(color: colors.ink),
            ),
            const SizedBox(height: 4),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                value,
                style: tokens.typography.numeric.copyWith(
                  color: colors.ink,
                  fontSize: 15,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
