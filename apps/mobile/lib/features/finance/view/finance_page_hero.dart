part of 'finance_page.dart';

class _OverviewHero extends StatelessWidget {
  const _OverviewHero({required this.state, required this.showAmounts});

  final FinanceState state;
  final bool showAmounts;

  @override
  Widget build(BuildContext context) {
    final type = context.tokens.typography;
    final currency = state.workspaceCurrency;
    var income = 0;
    var expense = 0;
    for (final transaction in state.recentTransactions) {
      if (transaction.isTransfer || transaction.reportOptIn == false) continue;
      final amount = transaction.amount;
      if (amount == null) continue;
      if (amount > 0) {
        income++;
      } else if (amount < 0) {
        expense++;
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
                    label: context.l10n.financeRecentIncomeEntries,
                    value: maskFinanceValue(
                      MaterialLocalizations.of(context).formatDecimal(income),
                      showAmounts: showAmounts,
                    ),
                    tone: FinanceTone.income,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _FlowTile(
                    label: context.l10n.financeRecentExpenseEntries,
                    value: maskFinanceValue(
                      MaterialLocalizations.of(context).formatDecimal(expense),
                      showAmounts: showAmounts,
                    ),
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
