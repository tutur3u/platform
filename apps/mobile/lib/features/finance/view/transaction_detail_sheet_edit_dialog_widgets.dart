part of 'transaction_detail_sheet.dart';

class _FormSectionCard extends StatelessWidget {
  const _FormSectionCard({
    required this.title,
    required this.child,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(14),
      radius: 22,
      backgroundColor: FinancePalette.of(context).elevatedPanel,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: shad.Theme.of(context).typography.small.copyWith(
              fontWeight: FontWeight.w800,
            ),
          ),
          const shad.Gap(10),
          child,
        ],
      ),
    );
  }
}

class _ModeSelectorCard extends StatelessWidget {
  const _ModeSelectorCard({
    required this.isTransfer,
    required this.canSwitchMode,
    required this.onChanged,
  });

  final bool isTransfer;
  final bool canSwitchMode;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = shad.Theme.of(context);
    final accent = FinancePalette.of(context).accent;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: theme.colorScheme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            children: [
              Expanded(
                child: _ModeTabButton(
                  label: l10n.financeTransactions,
                  selected: !isTransfer,
                  accent: accent,
                  onPressed: () => onChanged(false),
                ),
              ),
              const shad.Gap(4),
              Expanded(
                child: _ModeTabButton(
                  label: l10n.financeTransfer,
                  selected: isTransfer,
                  accent: accent,
                  onPressed: () => onChanged(true),
                ),
              ),
            ],
          ),
        ),
        if (!canSwitchMode) ...[
          const shad.Gap(6),
          Text(
            l10n.financeTransferModeEditHint,
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ],
    );
  }
}

class _ModeTabButton extends StatelessWidget {
  const _ModeTabButton({
    required this.label,
    required this.selected,
    required this.accent,
    required this.onPressed,
  });

  final String label;
  final bool selected;
  final Color accent;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          decoration: BoxDecoration(
            color: selected
                ? accent.withValues(alpha: 0.14)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(14),
          ),
          child: Center(
            child: Text(
              label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w700,
                color: selected ? accent : theme.colorScheme.mutedForeground,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DraftPreviewCard extends StatelessWidget {
  const _DraftPreviewCard({
    required this.title,
    required this.subtitle,
    required this.amountLabel,
    required this.accentColor,
    required this.isTransfer,
    this.walletName,
    this.categoryName,
    this.destinationWalletName,
    this.tagName,
  });

  final String title;
  final String subtitle;
  final String amountLabel;
  final Color accentColor;
  final bool isTransfer;
  final String? walletName;
  final String? categoryName;
  final String? destinationWalletName;
  final String? tagName;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final hasWalletName = walletName != null && walletName!.trim().isNotEmpty;
    final hasCategoryName =
        categoryName != null && categoryName!.trim().isNotEmpty;
    final hasDestinationWalletName =
        destinationWalletName != null &&
        destinationWalletName!.trim().isNotEmpty;
    final hasTagName = tagName != null && tagName!.trim().isNotEmpty;
    final chips = <Widget>[
      if (hasWalletName)
        _PreviewChip(
          icon: Icons.account_balance_wallet_outlined,
          label: walletName!.trim(),
          color: theme.colorScheme.foreground,
        ),
      if (!isTransfer && hasCategoryName)
        _PreviewChip(
          icon: Icons.category_outlined,
          label: categoryName!.trim(),
          color: accentColor,
        ),
      if (isTransfer && hasDestinationWalletName)
        _PreviewChip(
          icon: Icons.arrow_forward_rounded,
          label: destinationWalletName!.trim(),
          color: accentColor,
        ),
      if (hasTagName)
        _PreviewChip(
          icon: Icons.sell_outlined,
          label: tagName!.trim(),
          color: theme.colorScheme.mutedForeground,
        ),
    ];

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: accentColor.withValues(alpha: 0.18)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            accentColor.withValues(alpha: 0.18),
            FinancePalette.of(context).panel,
            FinancePalette.of(context).elevatedPanel,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    if (subtitle.trim().isNotEmpty) ...[
                      const shad.Gap(4),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.xSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const shad.Gap(12),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 132),
                child: Text(
                  amountLabel,
                  textAlign: TextAlign.right,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w900,
                    color: accentColor,
                    height: 1.05,
                  ),
                ),
              ),
            ],
          ),
          if (chips.isNotEmpty) ...[
            const shad.Gap(10),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: chips,
            ),
          ],
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

class _InlineAlertCard extends StatelessWidget {
  const _InlineAlertCard({
    required this.message,
    required this.color,
    required this.icon,
  });

  final String message;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.24)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const shad.Gap(10),
          Expanded(
            child: Text(
              message,
              style: shad.Theme.of(context).typography.textSmall.copyWith(
                color: color,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AmountEntryCard extends StatelessWidget {
  const _AmountEntryCard({
    required this.label,
    required this.controller,
    required this.currencyCode,
    required this.placeholder,
    required this.allowDecimal,
    required this.inputFormatters,
    required this.previewText,
    required this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final String currencyCode;
  final String placeholder;
  final bool allowDecimal;
  final List<TextInputFormatter> inputFormatters;
  final String previewText;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.7),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                label,
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.35,
                ),
              ),
              const Spacer(),
              Text(
                currencyCode.toUpperCase(),
                style: theme.typography.xSmall.copyWith(
                  color: theme.colorScheme.mutedForeground,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.35,
                ),
              ),
            ],
          ),
          const shad.Gap(6),
          shad.TextField(
            key: ValueKey(currencyCode),
            controller: controller,
            keyboardType: TextInputType.numberWithOptions(
              decimal: allowDecimal,
            ),
            inputFormatters: inputFormatters,
            placeholder: Text(placeholder),
            onChanged: onChanged,
          ),
          const shad.Gap(6),
          Text(
            previewText,
            style: theme.typography.xSmall.copyWith(
              color: theme.colorScheme.mutedForeground,
            ),
          ),
        ],
      ),
    );
  }
}

class _DatePickerCard extends StatelessWidget {
  const _DatePickerCard({
    required this.label,
    required this.value,
    required this.onPressed,
  });

  final String label;
  final String value;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return _SelectorSurface(
      label: label,
      title: value,
      leading: const Icon(Icons.schedule_rounded, size: 20),
      onPressed: onPressed,
    );
  }
}

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
    return _SelectorSurface(
      label: label,
      title: wallet?.name ?? placeholder ?? '-',
      subtitle: wallet?.currency?.toUpperCase(),
      leading: WalletVisualAvatar(
        icon: wallet?.icon,
        imageSrc: wallet?.imageSrc,
        fallbackIcon: Icons.wallet_outlined,
        size: 28,
      ),
      onPressed: onPressed,
    );
  }
}

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
    return _SelectorSurface(
      label: label,
      title: categoryName ?? '-',
      leading: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, size: 15, color: color),
      ),
      onPressed: onPressed,
    );
  }
}

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
    return _SelectorSurface(
      label: label,
      title: tagName ?? context.l10n.financeNoTag,
      leading: Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.16),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(Icons.sell_outlined, size: 15, color: color),
      ),
      onPressed: onPressed,
    );
  }
}

class _SelectorSurface extends StatelessWidget {
  const _SelectorSurface({
    required this.label,
    required this.title,
    required this.leading,
    required this.onPressed,
    this.subtitle,
  });

  final String label;
  final String title;
  final String? subtitle;
  final Widget leading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onPressed,
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: theme.colorScheme.card,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: theme.colorScheme.border.withValues(alpha: 0.72),
            ),
          ),
          child: Row(
            children: [
              leading,
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
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.small.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    if (subtitle != null && subtitle!.trim().isNotEmpty) ...[
                      const shad.Gap(3),
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.typography.textSmall.copyWith(
                          color: theme.colorScheme.mutedForeground,
                        ),
                      ),
                    ],
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

    return FinanceModalScaffold(
      title: title,
      subtitle: context.l10n.financePickerWalletSubtitle,
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
      child: ListView.separated(
        shrinkWrap: true,
        itemCount: list.length,
        separatorBuilder: (_, _) => const shad.Gap(8),
        itemBuilder: (context, index) {
          final wallet = list[index];
          return FinancePickerTile(
            title: wallet.name ?? '',
            subtitle: wallet.currency ?? 'USD',
            leading: WalletVisualAvatar(
              icon: wallet.icon,
              imageSrc: wallet.imageSrc,
              fallbackIcon: Icons.wallet_outlined,
              size: 30,
            ),
            onTap: () => Navigator.of(context).pop(wallet.id),
          );
        },
      ),
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
    return FinanceModalScaffold(
      title: context.l10n.financeCategory,
      subtitle: context.l10n.financePickerCategorySubtitle,
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
      child: ListView.separated(
        shrinkWrap: true,
        itemCount: categories.length,
        separatorBuilder: (_, _) => const shad.Gap(8),
        itemBuilder: (context, index) {
          final category = categories[index];
          final icon = resolvePlatformIcon(
            category.icon,
            fallback: category.isExpense != false
                ? Icons.arrow_downward
                : Icons.arrow_upward,
          );
          final color = categoryColor(category);
          return FinancePickerTile(
            title: category.name ?? '',
            subtitle: category.isExpense != false
                ? context.l10n.financeExpense
                : context.l10n.financeIncome,
            leading: Container(
              width: 32,
              height: 32,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 16, color: color),
            ),
            onTap: () => Navigator.of(context).pop(category.id),
          );
        },
      ),
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
    return FinanceModalScaffold(
      title: context.l10n.financeTags,
      subtitle: context.l10n.financePickerTagSubtitle,
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
      ],
      child: ListView.separated(
        shrinkWrap: true,
        itemCount: tags.length + 1,
        separatorBuilder: (_, _) => const shad.Gap(8),
        itemBuilder: (context, index) {
          if (index == 0) {
            return FinancePickerTile(
              title: context.l10n.financeNoTag,
              isSelected: selectedTagId == null,
              leading: Icon(
                Icons.block_outlined,
                size: 18,
                color: shad.Theme.of(context).colorScheme.mutedForeground,
              ),
              onTap: () => Navigator.of(context).pop(''),
            );
          }

          final tag = tags[index - 1];
          return FinancePickerTile(
            title: tag.name,
            isSelected: tag.id == selectedTagId,
            leading: Container(
              width: 18,
              height: 18,
              decoration: BoxDecoration(
                color: tagColor(tag),
                shape: BoxShape.circle,
              ),
            ),
            onTap: () => Navigator.of(context).pop(tag.id),
          );
        },
      ),
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

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(
          color: theme.colorScheme.border.withValues(alpha: 0.72),
        ),
      ),
      child: Column(
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
          const shad.Gap(10),
          shad.TextField(
            key: ValueKey(currencyCode),
            controller: controller,
            enabled: enabled,
            keyboardType: TextInputType.numberWithOptions(
              decimal: allowDecimal,
            ),
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
      ),
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
        _FormToggleTile(
          label: l10n.financeReportOptIn,
          value: reportOptIn,
          onChanged: onReportOptInChanged,
        ),
        if (!isTransfer) ...[
          const shad.Gap(12),
          _FormToggleTile(
            label: l10n.financeConfidentialAmount,
            value: isAmountConfidential,
            onChanged: onAmountConfidentialChanged,
          ),
          const shad.Gap(12),
          _FormToggleTile(
            label: l10n.financeConfidentialDescription,
            value: isDescriptionConfidential,
            onChanged: onDescriptionConfidentialChanged,
          ),
          const shad.Gap(12),
          _FormToggleTile(
            label: l10n.financeConfidentialCategory,
            value: isCategoryConfidential,
            onChanged: onCategoryConfidentialChanged,
          ),
        ],
      ],
    );
  }
}

class _FormToggleTile extends StatelessWidget {
  const _FormToggleTile({
    required this.label,
    required this.value,
    required this.onChanged,
  });

  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accent = value
        ? FinancePalette.of(context).accent
        : theme.colorScheme.mutedForeground;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      decoration: BoxDecoration(
        color: theme.colorScheme.card,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: (value ? accent : theme.colorScheme.border).withValues(
            alpha: value ? 0.36 : 0.72,
          ),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: theme.typography.small.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
          const shad.Gap(12),
          shad.Switch(
            value: value,
            onChanged: onChanged,
          ),
        ],
      ),
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
