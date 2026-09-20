part of 'grouped_transaction_accordion.dart';

class _TransactionTile extends StatelessWidget {
  const _TransactionTile({
    required this.transaction,
    required this.workspaceCurrency,
    required this.exchangeRates,
    required this.onTap,
    required this.usePanelChrome,
    required this.emphasizeTransactionRows,
    required this.showAmounts,
  });

  final Transaction transaction;
  final String workspaceCurrency;
  final List<ExchangeRate> exchangeRates;
  final VoidCallback onTap;
  final bool usePanelChrome;
  final bool emphasizeTransactionRows;
  final bool showAmounts;

  Color? _parseHex(String? hex) {
    if (hex == null) return null;
    final cleaned = hex.replaceFirst('#', '');
    if (cleaned.length != 6 && cleaned.length != 8) return null;
    final value = int.tryParse(
      cleaned.length == 6 ? 'FF$cleaned' : cleaned,
      radix: 16,
    );
    return value != null ? Color(value) : null;
  }

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
    final transferRouteTitle = isTransfer && transaction.transfer != null
        ? '${_sourceWalletName()} → ${_destinationWalletName()}'
        : null;
    final title = isTransfer
        ? (transferRouteTitle ?? context.l10n.financeTransfer)
        : (transaction.categoryName ?? rawDescription ?? '—');
    final description = isTransfer
        ? (hasDescription ? rawDescription : null)
        : (hasDescription && rawDescription != title ? rawDescription : null);

    final categoryColor =
        _parseHex(transaction.categoryColor) ??
        (isTransfer
            ? palette.accent
            : (isExpense ? palette.negative : palette.positive));

    final actualAmountText = isExpense
        ? formatCurrency(amount, currency)
        : '+${formatCurrency(amount, currency)}';
    final amountText = showAmounts ? actualAmountText : _maskedAmountText();
    final semanticsLabel = [
      title,
      if (showAmounts) actualAmountText,
    ].where((part) => part.isNotEmpty).join(', ');
    final actualConvertedAmountText = showConvertedAmount
        ? (convertedAmount >= 0
              ? '≈ +${formatCurrency(convertedAmount, workspaceCurrency)}'
              : '≈ ${formatCurrency(convertedAmount, workspaceCurrency)}')
        : null;
    final convertedAmountText = showAmounts ? actualConvertedAmountText : null;
    final transferLinkedAmountText =
        isTransfer &&
            transaction.transfer?.linkedAmount != null &&
            transaction.transfer?.linkedWalletCurrency != null &&
            transaction.transfer!.linkedWalletCurrency!.toUpperCase() !=
                currency.toUpperCase()
        ? (showAmounts
              ? formatCurrency(
                  transaction.transfer!.linkedAmount!,
                  transaction.transfer!.linkedWalletCurrency!,
                )
              : _maskedAmountText())
        : null;

    final categoryIcon = resolveTransactionCategoryIcon(transaction);
    final metaChips = Wrap(
      spacing: 6,
      runSpacing: 4,
      children: [
        if (isTransfer)
          _Chip(
            label: context.l10n.financeTransfer,
            icon: categoryIcon,
            color: categoryColor,
          ),
        if (!isTransfer && transaction.categoryName != null)
          _Chip(
            label: transaction.categoryName!,
            icon: categoryIcon,
            color: categoryColor,
          ),
        if (!isTransfer && transaction.walletName != null)
          _Chip(
            label: transaction.walletName!,
            leading: WalletVisualAvatar(
              icon: transaction.walletIcon,
              imageSrc: transaction.walletImageSrc,
              fallbackIcon: lucide.LucideIcons.walletCards,
              size: 14,
            ),
          ),
      ],
    );
    final tagsWrap = Wrap(
      spacing: 4,
      runSpacing: 4,
      children: transaction.tags.map((tag) {
        final tagColor =
            _parseHex(tag.color) ?? FinancePalette.of(context).accent;
        return Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
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
    );
    final content = emphasizeTransactionRows
        ? Column(
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
                  maxLines: 2,
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
                metaChips,
              ],
              if (transaction.tags.isNotEmpty) ...[
                const SizedBox(height: 8),
                tagsWrap,
              ],
              if (isTransfer || convertedAmountText != null) ...[
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
              ] else if (transaction.reportOptIn != true) ...[
                const SizedBox(height: 8),
                _MutedInlineInfo(
                  icon: Icons.insights_outlined,
                  label: context.l10n.financeExcludedFromReports,
                  color: excludedReportColor,
                ),
              ],
            ],
          )
        : Row(
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
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                        height: 1.3,
                      ),
                    ),
                    const SizedBox(height: 8),
                    metaChips,
                    if (transaction.tags.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      tagsWrap,
                    ],
                    if (transaction.reportOptIn != true) ...[
                      const SizedBox(height: 6),
                      _MutedInlineInfo(
                        icon: Icons.insights_outlined,
                        label: context.l10n.financeExcludedFromReports,
                        color: excludedReportColor,
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 118),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: Alignment.centerRight,
                      child: Text(
                        amountText,
                        maxLines: 1,
                        style: theme.typography.small.copyWith(
                          fontWeight: FontWeight.w800,
                          color: isTransfer
                              ? palette.accent
                              : isExpense
                              ? palette.negative
                              : palette.positive,
                        ),
                      ),
                    ),
                    if (transferLinkedAmountText != null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          transferLinkedAmountText,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                    if (convertedAmountText != null &&
                        transferLinkedAmountText == null)
                      Padding(
                        padding: const EdgeInsets.only(top: 4),
                        child: Text(
                          convertedAmountText,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.typography.xSmall.copyWith(
                            color: colorScheme.mutedForeground,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          );

    final tileChild = usePanelChrome
        ? FinancePanel(
            radius: 20,
            onTap: onTap,
            borderColor: categoryColor.withValues(alpha: 0.28),
            padding: const EdgeInsets.all(14),
            child: content,
          )
        : Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: onTap,
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: content,
              ),
            ),
          );

    return Semantics(
      button: true,
      onTap: onTap,
      label: semanticsLabel,
      child: tileChild,
    );
  }
}

class _SummaryPill extends StatelessWidget {
  const _SummaryPill({
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
    this.trailingIcon,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;
  final IconData? trailingIcon;

  @override
  Widget build(BuildContext context) {
    final body = Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Text(
            label,
            style: shad.Theme.of(context).typography.xSmall.copyWith(
              color: color,
              fontWeight: FontWeight.w700,
            ),
          ),
          if (trailingIcon != null) ...[
            const SizedBox(width: 4),
            Icon(trailingIcon, size: 14, color: color),
          ],
        ],
      ),
    );

    if (onTap == null) {
      return body;
    }

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: body,
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

class _Chip extends StatelessWidget {
  const _Chip({required this.label, this.icon, this.leading, this.color});

  final String label;
  final IconData? icon;
  final Widget? leading;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final effectiveColor = color ?? colorScheme.mutedForeground;
    final availableWidth = MediaQuery.sizeOf(context).width - 88;
    final maxWidth = availableWidth > 180 ? availableWidth : 180.0;

    return Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
      decoration: BoxDecoration(
        color: effectiveColor.withValues(alpha: 0.1),
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
