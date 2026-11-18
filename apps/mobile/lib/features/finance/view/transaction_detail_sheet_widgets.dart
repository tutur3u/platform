part of 'transaction_detail_sheet.dart';

class _TransactionSummaryCard extends StatelessWidget {
  const _TransactionSummaryCard({
    required this.transaction,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.showAmounts,
  });

  final Transaction transaction;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final bool showAmounts;

  String _money(double? value, String currency, {bool approximate = false}) {
    if (value == null) return financeMaskedAmountPlaceholder;
    return maskFinanceValue(
      formatFinanceAmount(
        value,
        currency,
        signed: !transaction.isTransfer,
        approximate: approximate,
      ),
      showAmounts: showAmounts,
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final amount = transaction.amount;
    final hiddenAmount = showAmounts ? null : l10n.financeHiddenAmount;
    final transfer = transaction.transfer;
    final currency = transaction.walletCurrency ?? workspaceCurrency;
    final walletName = transaction.walletName ?? '—';
    final title = transfer == null
        ? transaction.categoryName ?? walletName
        : transfer.isOrigin
        ? '$walletName → ${transfer.linkedWalletName}'
        : '${transfer.linkedWalletName} → $walletName';
    final converted =
        amount != null &&
            currency.toUpperCase() != workspaceCurrency.toUpperCase()
        ? convertCurrency(amount, currency, workspaceCurrency, exchangeRates)
        : null;
    final linkedCurrency = transfer?.linkedWalletCurrency;
    return AppSummaryHero(
      eyebrow: title,
      headline: _money(amount, currency),
      headlineSemanticsLabel: amount == null
          ? l10n.financeHiddenAmount
          : hiddenAmount,
      icon: resolveTransactionCategoryIcon(transaction),
      tone: transaction.isTransfer
          ? AppTone.primary
          : (amount ?? 0) < 0
          ? AppTone.destructive
          : AppTone.success,
      supporting: transaction.description,
      facts: [
        if (linkedCurrency != null &&
            transfer?.linkedAmount != null &&
            linkedCurrency.toUpperCase() != currency.toUpperCase())
          AppHeroFact(
            label: transfer!.linkedWalletName,
            value: _money(transfer.linkedAmount, linkedCurrency),
            valueSemanticsLabel: hiddenAmount,
          )
        else if (converted != null)
          AppHeroFact(
            label: workspaceCurrency,
            value: _money(converted, workspaceCurrency, approximate: true),
            valueSemanticsLabel: hiddenAmount,
          ),
        if (!transaction.isTransfer && transaction.walletName != null)
          AppHeroFact(label: l10n.financeWallet, value: walletName),
      ],
    );
  }
}

class _DetailSectionCard extends StatelessWidget {
  const _DetailSectionCard({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: shad.Theme.of(
              context,
            ).typography.small.copyWith(fontWeight: FontWeight.w800),
          ),
          const shad.Gap(14),
          child,
        ],
      ),
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({
    required this.icon,
    required this.label,
    required this.value,
    this.onTap,
  });

  final IconData icon;
  final String label;
  final String value;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: theme.colorScheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 16, color: theme.colorScheme.primary),
              ),
              const shad.Gap(12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: theme.typography.xSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.35,
                      ),
                    ),
                    const shad.Gap(4),
                    Text(
                      value,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
              const shad.Gap(10),
              Icon(
                Icons.chevron_right_rounded,
                size: 18,
                color: theme.colorScheme.mutedForeground,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _QuickActionToggleTile extends StatelessWidget {
  const _QuickActionToggleTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.enabled,
    required this.activeLabel,
    required this.inactiveLabel,
    required this.onChanged,
  });

  final IconData icon;
  final String label;
  final bool value;
  final bool enabled;
  final String activeLabel;
  final String inactiveLabel;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = value
        ? theme.colorScheme.primary
        : theme.colorScheme.mutedForeground;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: accent.withValues(alpha: value ? 0.36 : 0.18),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: accent.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(icon, size: 16, color: accent),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: theme.typography.xSmall.copyWith(
                    color: theme.colorScheme.mutedForeground,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.35,
                  ),
                ),
                const shad.Gap(4),
                Text(
                  value ? activeLabel : inactiveLabel,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
          const shad.Gap(12),
          shad.Switch(value: value, onChanged: enabled ? onChanged : null),
        ],
      ),
    );
  }
}

class _DetailChip extends StatelessWidget {
  const _DetailChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const shad.Gap(6),
          Text(
            label,
            style: shad.Theme.of(context).typography.xSmall.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _PreviewChip extends StatelessWidget {
  const _PreviewChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: color),
          const shad.Gap(4),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 148),
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: shad.Theme.of(context).typography.xSmall.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

List<Widget> _transactionPrivacyChips(
  BuildContext context,
  Transaction transaction,
) {
  final l10n = context.l10n;
  final theme = shad.Theme.of(context);
  final excludedReportColor = theme.colorScheme.mutedForeground.withValues(
    alpha: 0.72,
  );
  return [
    if (transaction.reportOptIn == true)
      _DetailChip(
        icon: Icons.insights_outlined,
        label: l10n.financeReportOptIn,
        color: theme.colorScheme.primary,
      )
    else
      _DetailChip(
        icon: Icons.insights_outlined,
        label: l10n.financeExcludedFromReports,
        color: excludedReportColor,
      ),
    if (transaction.isAmountConfidential == true)
      _DetailChip(
        icon: Icons.visibility_off_outlined,
        label: l10n.financeConfidentialAmount,
        color: theme.colorScheme.destructive,
      ),
    if (transaction.isDescriptionConfidential == true)
      _DetailChip(
        icon: Icons.notes_outlined,
        label: l10n.financeConfidentialDescription,
        color: theme.colorScheme.destructive,
      ),
    if (transaction.isCategoryConfidential == true)
      _DetailChip(
        icon: Icons.category_outlined,
        label: l10n.financeConfidentialCategory,
        color: theme.colorScheme.destructive,
      ),
  ];
}
