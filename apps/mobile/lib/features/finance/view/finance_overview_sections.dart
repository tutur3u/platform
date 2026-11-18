part of 'finance_page.dart';

/// Finance overview content below the shared shell navigation.
class FinanceOverviewContent extends StatelessWidget {
  const FinanceOverviewContent({
    required this.state,
    required this.showAmounts,
    required this.onTransactionTap,
    required this.onCreate,
    super.key,
  });

  final FinanceState state;
  final bool showAmounts;
  final ValueChanged<Transaction> onTransactionTap;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return LayoutBuilder(
      builder: (context, constraints) {
        final balanceAndWallets = Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _OverviewHero(state: state, showAmounts: showAmounts),
            const SizedBox(height: AppLayout.sectionGap),
            _OverviewWallets(state: state, showAmounts: showAmounts),
          ],
        );
        final recent = _OverviewRecent(
          state: state,
          showAmounts: showAmounts,
          onTransactionTap: onTransactionTap,
          onCreate: onCreate,
        );
        final wide =
            Breakpoints.fromWidth(constraints.maxWidth) != DeviceClass.compact;
        return AppPageListView(
          kind: AppPageKind.root,
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            if (wide)
              Row(
                spacing: AppLayout.sectionGap,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: balanceAndWallets),
                  Expanded(child: recent),
                ],
              )
            else
              Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: AppLayout.sectionGap,
                children: [balanceAndWallets, recent],
              ),
            const SizedBox(height: AppLayout.sectionGap),
            AppCard(
              padding: EdgeInsets.zero,
              child: AppRichRow(
                title: l10n.financeCheckpointsTitle,
                leading: const AppIconTile(icon: Icons.fact_check_outlined),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () => context.push(Routes.financeCheckpoints),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _OverviewWallets extends StatelessWidget {
  const _OverviewWallets({required this.state, required this.showAmounts});

  final FinanceState state;
  final bool showAmounts;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(
          title: l10n.financeOverviewWalletSectionTitle,
          actionLabel: l10n.financeManageLabel,
          onAction: () => context.push(Routes.wallets),
        ),
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
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: IntrinsicHeight(
              child: Row(
                spacing: 8,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  for (final wallet in state.wallets)
                    _OverviewWallet(
                      wallet: wallet,
                      workspaceCurrency: state.workspaceCurrency,
                      exchangeRates: state.exchangeRates,
                      showAmounts: showAmounts,
                    ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _OverviewRecent extends StatelessWidget {
  const _OverviewRecent({
    required this.state,
    required this.showAmounts,
    required this.onTransactionTap,
    required this.onCreate,
  });

  final FinanceState state;
  final bool showAmounts;
  final ValueChanged<Transaction> onTransactionTap;
  final VoidCallback onCreate;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppSectionHeader(
          title: l10n.financeRecentTransactions,
          actionLabel: l10n.financeViewAll,
          onAction: () => context.push(Routes.transactions),
        ),
        if (state.recentTransactions.isEmpty)
          FinanceEmptyState(
            icon: Icons.receipt_long_outlined,
            title: l10n.financeNoTransactions,
            body: l10n.financeOverviewNoTransactionsBody,
            action: shad.SecondaryButton(
              onPressed: onCreate,
              child: Text(l10n.financeAddFirstTransaction),
            ),
          )
        else
          AppCard(
            padding: EdgeInsets.zero,
            child: Column(
              children: [
                for (final (index, transaction)
                    in state.recentTransactions.take(5).indexed) ...[
                  if (index > 0) const _OverviewDivider(),
                  _OverviewTransaction(
                    transaction: transaction,
                    currency:
                        transaction.walletCurrency ?? state.workspaceCurrency,
                    showAmounts: showAmounts,
                    onTap: () => onTransactionTap(transaction),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }
}

class _OverviewDivider extends StatelessWidget {
  const _OverviewDivider();

  @override
  Widget build(BuildContext context) => Divider(
    height: 1,
    thickness: 1,
    color: context.tokens.colorScheme.border,
  );
}
