part of 'finance_page.dart';

class _OverviewHero extends StatelessWidget {
  const _OverviewHero({required this.state, required this.showAmounts});

  final FinanceState state;
  final bool showAmounts;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);
    final formattedBalance = formatCurrency(
      state.totalBalance,
      state.workspaceCurrency,
    );

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
                      context.l10n.financeNetBalance,
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
          SizedBox(
            width: double.infinity,
            child: FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                maskFinanceValue(
                  '${state.hasCrossCurrencyWallets ? '≈ ' : ''}'
                  '$formattedBalance',
                  showAmounts: showAmounts,
                ),
                maxLines: 1,
                softWrap: false,
                style: theme.typography.h3.copyWith(
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                ),
              ),
            ),
          ),
          const shad.Gap(18),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _FinanceHeroChip(
                icon: Icons.account_balance_wallet_outlined,
                label: context.l10n.financeOverviewWalletCount(
                  state.wallets.length,
                ),
              ),
              _FinanceHeroChip(
                icon: Icons.swap_horiz_rounded,
                label: context.l10n.financeOverviewRecentCount(
                  state.recentTransactions.length,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FinanceHeroChip extends StatelessWidget {
  const _FinanceHeroChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final palette = FinancePalette.of(context);
    final theme = shad.Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 8),
      decoration: BoxDecoration(
        color: palette.accent.withValues(alpha: 0.10),
        border: Border.all(color: palette.subtleBorder),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 16, color: palette.accent),
          const SizedBox(width: 6),
          Text(label, style: theme.typography.xSmall),
        ],
      ),
    );
  }
}
