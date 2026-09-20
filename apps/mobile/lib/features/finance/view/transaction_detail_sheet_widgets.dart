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

  String _sourceWalletName() {
    final transfer = transaction.transfer;
    if (transfer == null) {
      return transaction.walletName ?? '-';
    }

    return transfer.isOrigin
        ? (transaction.walletName ?? '-')
        : transfer.linkedWalletName;
  }

  String _destinationWalletName() {
    final transfer = transaction.transfer;
    if (transfer == null) {
      return transaction.walletName ?? '-';
    }

    return transfer.isOrigin
        ? transfer.linkedWalletName
        : (transaction.walletName ?? '-');
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final colorScheme = theme.colorScheme;
    final amount = transaction.amount ?? 0;
    final isExpense = amount < 0;
    final isTransfer = transaction.isTransfer;
    final currency = transaction.walletCurrency ?? workspaceCurrency;
    final convertedAmount = convertCurrency(
      amount,
      currency,
      workspaceCurrency,
      exchangeRates,
    );
    final showConvertedAmount =
        convertedAmount != null &&
        currency.toUpperCase() != workspaceCurrency.toUpperCase();
    final excludedReportColor = colorScheme.mutedForeground.withValues(
      alpha: 0.72,
    );
    final rawDescription = transaction.description?.trim();
    final hasDescription = rawDescription?.isNotEmpty ?? false;
    final title = isTransfer
        ? '${_sourceWalletName()} → ${_destinationWalletName()}'
        : (transaction.categoryName ?? rawDescription ?? '—');
    final description = isTransfer
        ? (hasDescription ? rawDescription : null)
        : (hasDescription && rawDescription != title ? rawDescription : null);
    final categoryColor =
        _parseHexColor(transaction.categoryColor) ??
        (isTransfer
            ? palette.accent
            : (isExpense ? palette.negative : palette.positive));
    final amountText = maskFinanceValue(
      isExpense
          ? formatCurrency(amount, currency)
          : '+${formatCurrency(amount, currency)}',
      showAmounts: showAmounts,
    );
    final convertedAmountText = showConvertedAmount
        ? maskFinanceValue(
            convertedAmount >= 0
                ? '≈ +${formatCurrency(convertedAmount, workspaceCurrency)}'
                : '≈ ${formatCurrency(convertedAmount, workspaceCurrency)}',
            showAmounts: showAmounts,
          )
        : null;
    final transferLinkedAmountText =
        isTransfer &&
            transaction.transfer?.linkedAmount != null &&
            transaction.transfer?.linkedWalletCurrency != null &&
            transaction.transfer!.linkedWalletCurrency!.toUpperCase() !=
                currency.toUpperCase()
        ? maskFinanceValue(
            formatCurrency(
              transaction.transfer!.linkedAmount!,
              transaction.transfer!.linkedWalletCurrency!,
            ),
            showAmounts: showAmounts,
          )
        : null;
    final categoryIcon = resolveTransactionCategoryIcon(transaction);

    return FinancePanel(
      radius: 20,
      borderColor: categoryColor.withValues(alpha: 0.28),
      padding: const EdgeInsets.all(14),
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: categoryColor.withValues(alpha: 0.14),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Icon(categoryIcon, size: 18, color: categoryColor),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Align(
                  alignment: Alignment.topRight,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        amountText,
                        maxLines: 1,
                        style: theme.typography.large.copyWith(
                          fontWeight: FontWeight.w900,
                          color: isTransfer
                              ? palette.accent
                              : isExpense
                              ? palette.negative
                              : palette.positive,
                        ),
                      ),
                      if (transferLinkedAmountText != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          transferLinkedAmountText,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ] else if (convertedAmountText != null) ...[
                        const SizedBox(height: 2),
                        Text(
                          convertedAmountText,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w700,
              height: 1.3,
            ),
          ),
          if (description != null) ...[
            const SizedBox(height: 4),
            Text(
              description,
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: colorScheme.mutedForeground,
                height: 1.3,
              ),
            ),
          ],
          if (isTransfer ||
              transaction.categoryName != null ||
              transaction.walletName != null) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                if (isTransfer)
                  _SummaryChip(
                    label: context.l10n.financeTransfer,
                    icon: categoryIcon,
                    color: categoryColor,
                  ),
                if (!isTransfer && transaction.categoryName != null)
                  _SummaryChip(
                    label: transaction.categoryName!,
                    icon: categoryIcon,
                    color: categoryColor,
                  ),
                if (!isTransfer && transaction.walletName != null)
                  _SummaryChip(
                    label: transaction.walletName!,
                    leading: WalletVisualAvatar(
                      icon: transaction.walletIcon,
                      imageSrc: transaction.walletImageSrc,
                      fallbackIcon: Icons.account_balance_wallet_outlined,
                      size: 14,
                    ),
                  ),
              ],
            ),
          ],
          if (transaction.tags.isNotEmpty) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: transaction.tags.map((tag) {
                final tagColor =
                    _parseHexColor(tag.color) ??
                    FinancePalette.of(context).accent;
                return Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 7,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: tagColor.withValues(alpha: 0.10),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    tag.name,
                    style: theme.typography.xSmall.copyWith(
                      color: tagColor,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                );
              }).toList(),
            ),
          ],
          if (convertedAmountText != null ||
              transaction.reportOptIn != true) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 10,
              runSpacing: 4,
              children: [
                if (transaction.reportOptIn != true)
                  _MutedInlineInfo(
                    icon: Icons.insights_outlined,
                    label: context.l10n.financeExcludedFromReports,
                    color: excludedReportColor,
                  ),
                if (convertedAmountText != null)
                  _MutedInlineInfo(
                    icon: Icons.currency_exchange_rounded,
                    label: convertedAmountText,
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _SummaryChip extends StatelessWidget {
  const _SummaryChip({
    required this.label,
    this.icon,
    this.leading,
    this.color,
  });

  final String label;
  final IconData? icon;
  final Widget? leading;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final effectiveColor = color ?? theme.colorScheme.mutedForeground;
    final availableWidth = MediaQuery.sizeOf(context).width - 88;
    final maxWidth = availableWidth > 180 ? availableWidth : 180.0;

    return Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
      decoration: BoxDecoration(
        color: effectiveColor.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: effectiveColor.withValues(alpha: 0.25)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (leading != null) ...[
            leading!,
            const SizedBox(width: 4),
          ] else if (icon != null) ...[
            Icon(icon, size: 11, color: effectiveColor.withValues(alpha: 0.8)),
            const SizedBox(width: 3),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.xSmall.copyWith(
                color: effectiveColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MutedInlineInfo extends StatelessWidget {
  const _MutedInlineInfo({required this.icon, required this.label, this.color});

  final IconData icon;
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final resolvedColor = color ?? theme.colorScheme.mutedForeground;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: resolvedColor),
        const SizedBox(width: 4),
        Text(
          label,
          style: theme.typography.xSmall.copyWith(color: resolvedColor),
        ),
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
