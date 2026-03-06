part of 'transaction_detail_sheet.dart';

/// Outline button for selecting a wallet.
class _WalletSelectorButton extends StatelessWidget {
  const _WalletSelectorButton({
    required this.label,
    required this.onPressed,
    this.wallet,
    this.placeholder,
  });

  final String label;
  final Wallet? wallet;
  final String? placeholder;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: shad.Theme.of(context).typography.small),
        const shad.Gap(4),
        shad.OutlineButton(
          onPressed: onPressed,
          child: Row(
            children: [
              WalletVisualAvatar(
                icon: wallet?.icon,
                imageSrc: wallet?.imageSrc,
                fallbackIcon: Icons.wallet_outlined,
                size: 28,
              ),
              const shad.Gap(8),
              Expanded(
                child: Text(
                  wallet?.name ?? placeholder ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const Icon(Icons.expand_more, size: 16),
            ],
          ),
        ),
      ],
    );
  }
}

/// Outline button for selecting a category.
class _CategorySelectorButton extends StatelessWidget {
  const _CategorySelectorButton({
    required this.label,
    required this.icon,
    required this.color,
    required this.onPressed,
    this.categoryName,
  });

  final String label;
  final String? categoryName;
  final IconData icon;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: shad.Theme.of(context).typography.small),
        const shad.Gap(4),
        shad.OutlineButton(
          onPressed: onPressed,
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.16),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 13, color: color),
              ),
              const shad.Gap(8),
              Expanded(
                child: Text(
                  categoryName ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const Icon(Icons.expand_more, size: 16),
            ],
          ),
        ),
      ],
    );
  }
}

/// Outline button for selecting a tag.
class _TagSelectorButton extends StatelessWidget {
  const _TagSelectorButton({
    required this.label,
    required this.color,
    required this.onPressed,
    this.tagName,
  });

  final String label;
  final String? tagName;
  final Color color;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: shad.Theme.of(context).typography.small),
        const shad.Gap(4),
        shad.OutlineButton(
          onPressed: onPressed,
          child: Row(
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.16),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.sell_outlined, size: 13, color: color),
              ),
              const shad.Gap(8),
              Expanded(
                child: Text(
                  tagName ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const Icon(Icons.expand_more, size: 16),
            ],
          ),
        ),
      ],
    );
  }
}

/// Wallet picker dialog. Optionally excludes a wallet (e.g. for destination).
class _WalletPickerDialog extends StatelessWidget {
  const _WalletPickerDialog({
    required this.wallets,
    required this.title,
    this.excludeWalletId,
  });

  final List<Wallet> wallets;
  final String title;
  final String? excludeWalletId;

  @override
  Widget build(BuildContext context) {
    final list = excludeWalletId != null
        ? wallets.where((w) => w.id != excludeWalletId).toList()
        : wallets;

    return shad.AlertDialog(
      title: Text(title),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: list
                .map(
                  (wallet) => shad.GhostButton(
                    onPressed: () => Navigator.of(context).pop(wallet.id),
                    child: Row(
                      children: [
                        WalletVisualAvatar(
                          icon: wallet.icon,
                          imageSrc: wallet.imageSrc,
                          fallbackIcon: Icons.wallet_outlined,
                          size: 28,
                        ),
                        const shad.Gap(8),
                        Expanded(
                          child: Text(
                            wallet.name ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                        Text(
                          wallet.currency ?? 'USD',
                          style: shad.Theme.of(context).typography.xSmall
                              .copyWith(
                                color: shad.Theme.of(
                                  context,
                                ).colorScheme.mutedForeground,
                              ),
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
    );
  }
}

/// Category picker dialog.
class _CategoryPickerDialog extends StatelessWidget {
  const _CategoryPickerDialog({
    required this.categories,
    required this.categoryColor,
  });

  final List<TransactionCategory> categories;
  final Color Function(TransactionCategory) categoryColor;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(context.l10n.financeCategory),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: categories
                .map(
                  (category) => shad.GhostButton(
                    onPressed: () => Navigator.of(context).pop(category.id),
                    child: Row(
                      children: [
                        Container(
                          width: 26,
                          height: 26,
                          decoration: BoxDecoration(
                            color: categoryColor(category).withValues(
                              alpha: 0.16,
                            ),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            resolvePlatformIcon(
                              category.icon,
                              fallback: category.isExpense != false
                                  ? Icons.arrow_downward
                                  : Icons.arrow_upward,
                            ),
                            size: 14,
                            color: categoryColor(category),
                          ),
                        ),
                        const shad.Gap(8),
                        Expanded(
                          child: Text(
                            category.name ?? '',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
                .toList(),
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
    );
  }
}

/// Tag picker dialog with a clear option.
class _TagPickerDialog extends StatelessWidget {
  const _TagPickerDialog({
    required this.tags,
    required this.tagColor,
    this.selectedTagId,
  });

  final List<FinanceTag> tags;
  final String? selectedTagId;
  final Color Function(FinanceTag) tagColor;

  @override
  Widget build(BuildContext context) {
    return shad.AlertDialog(
      title: Text(context.l10n.financeTags),
      content: SizedBox(
        width: double.maxFinite,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              shad.GhostButton(
                onPressed: () => Navigator.of(context).pop(''),
                child: Row(
                  children: [
                    Icon(
                      Icons.block_outlined,
                      size: 16,
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                    const shad.Gap(8),
                    const Expanded(
                      child: Text(
                        '-',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    if (selectedTagId == null)
                      const Icon(Icons.check, size: 16),
                  ],
                ),
              ),
              ...tags.map(
                (tag) => shad.GhostButton(
                  onPressed: () => Navigator.of(context).pop(tag.id),
                  child: Row(
                    children: [
                      Container(
                        width: 16,
                        height: 16,
                        decoration: BoxDecoration(
                          color: tagColor(tag),
                          shape: BoxShape.circle,
                        ),
                      ),
                      const shad.Gap(8),
                      Expanded(
                        child: Text(
                          tag.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      if (tag.id == selectedTagId)
                        const Icon(Icons.check, size: 16),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
    );
  }
}

/// Transfer destination amount section: label, auto/manual toggle, field, rate.
class _TransferDestinationAmountSection extends StatelessWidget {
  const _TransferDestinationAmountSection({
    required this.controller,
    required this.currencyCode,
    required this.enabled,
    required this.previewText,
    required this.isOverridden,
    required this.onToggleOverride,
    required this.hintText,
    required this.inputFormatters,
    required this.placeholder,
    required this.allowDecimal,
    required this.exchangeRateDisplay,
    required this.onInvertRate,
    required this.invertRateTooltip,
    required this.isCrossCurrency,
  });

  final TextEditingController controller;
  final String currencyCode;
  final bool enabled;
  final String previewText;
  final bool isOverridden;
  final VoidCallback onToggleOverride;
  final String hintText;
  final List<TextInputFormatter> inputFormatters;
  final String placeholder;
  final bool allowDecimal;
  final String exchangeRateDisplay;
  final VoidCallback onInvertRate;
  final String invertRateTooltip;
  final bool isCrossCurrency;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                l10n.financeDestinationAmountOptional,
                style: theme.typography.small,
              ),
            ),
            if (isCrossCurrency)
              GestureDetector(
                onTap: onToggleOverride,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 6,
                    vertical: 2,
                  ),
                  decoration: BoxDecoration(
                    color: isOverridden
                        ? Colors.orange.withValues(alpha: 0.12)
                        : Colors.blue.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        isOverridden ? Icons.edit : Icons.auto_awesome,
                        size: 11,
                        color: isOverridden ? Colors.orange : Colors.blue,
                      ),
                      const shad.Gap(3),
                      Text(
                        isOverridden
                            ? l10n.financeDestinationAmountOverride
                            : l10n.financeDestinationAmountAuto,
                        style: theme.typography.xSmall.copyWith(
                          color: isOverridden ? Colors.orange : Colors.blue,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        ),
        const shad.Gap(4),
        shad.TextField(
          key: ValueKey(currencyCode),
          controller: controller,
          enabled: enabled,
          keyboardType: TextInputType.numberWithOptions(decimal: allowDecimal),
          inputFormatters: inputFormatters,
          placeholder: Text(placeholder),
        ),
        const shad.Gap(6),
        Text(
          previewText,
          style: theme.typography.xSmall.copyWith(
            color: theme.colorScheme.mutedForeground,
          ),
        ),
        if (hintText.isNotEmpty) ...[
          const shad.Gap(4),
          Text(
            hintText,
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
        if (isCrossCurrency && exchangeRateDisplay.isNotEmpty) ...[
          const shad.Gap(8),
          _ExchangeRateDisplay(
            exchangeRateDisplay: exchangeRateDisplay,
            onInvertRate: onInvertRate,
            invertRateTooltip: invertRateTooltip,
          ),
        ],
      ],
    );
  }
}

/// Settings tab: report opt-in and confidential toggles.
class _TransactionFormSettingsTab extends StatelessWidget {
  const _TransactionFormSettingsTab({
    required this.reportOptIn,
    required this.onReportOptInChanged,
    required this.isTransfer,
    required this.isAmountConfidential,
    required this.onAmountConfidentialChanged,
    required this.isDescriptionConfidential,
    required this.onDescriptionConfidentialChanged,
    required this.isCategoryConfidential,
    required this.onCategoryConfidentialChanged,
  });

  final bool reportOptIn;
  final ValueChanged<bool> onReportOptInChanged;
  final bool isTransfer;
  final bool isAmountConfidential;
  final ValueChanged<bool> onAmountConfidentialChanged;
  final bool isDescriptionConfidential;
  final ValueChanged<bool> onDescriptionConfidentialChanged;
  final bool isCategoryConfidential;
  final ValueChanged<bool> onCategoryConfidentialChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _ToggleRow(
          label: l10n.financeReportOptIn,
          value: reportOptIn,
          onChanged: onReportOptInChanged,
        ),
        if (!isTransfer) ...[
          const shad.Gap(12),
          _ToggleRow(
            label: l10n.financeConfidentialAmount,
            value: isAmountConfidential,
            onChanged: onAmountConfidentialChanged,
          ),
          const shad.Gap(12),
          _ToggleRow(
            label: l10n.financeConfidentialDescription,
            value: isDescriptionConfidential,
            onChanged: onDescriptionConfidentialChanged,
          ),
          const shad.Gap(12),
          _ToggleRow(
            label: l10n.financeConfidentialCategory,
            value: isCategoryConfidential,
            onChanged: onCategoryConfidentialChanged,
          ),
        ],
      ],
    );
  }
}

/// Exchange rate display chip with invert button.
class _ExchangeRateDisplay extends StatelessWidget {
  const _ExchangeRateDisplay({
    required this.exchangeRateDisplay,
    required this.onInvertRate,
    required this.invertRateTooltip,
  });

  final String exchangeRateDisplay;
  final VoidCallback onInvertRate;
  final String invertRateTooltip;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.blue.withValues(alpha: 0.06),
        border: Border.all(
          color: Colors.blue.withValues(alpha: 0.28),
        ),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.currency_exchange, size: 14, color: Colors.blue),
          const shad.Gap(6),
          Text(
            '${l10n.financeExchangeRate}: ',
            style: theme.typography.xSmall.copyWith(
              color: Colors.blue,
              fontWeight: FontWeight.w600,
            ),
          ),
          Expanded(
            child: Text(
              exchangeRateDisplay,
              style: theme.typography.xSmall.copyWith(
                color: Colors.blue,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          ),
          GestureDetector(
            onTap: onInvertRate,
            child: Tooltip(
              message: invertRateTooltip,
              child: const Padding(
                padding: EdgeInsets.all(4),
                child: Icon(Icons.swap_horiz, size: 14, color: Colors.blue),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
