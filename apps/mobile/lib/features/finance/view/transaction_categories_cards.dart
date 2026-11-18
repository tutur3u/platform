part of 'transaction_categories_page.dart';

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({
    required this.category,
    required this.currencyCode,
    required this.showAmounts,
    required this.onEdit,
    required this.onDelete,
  });

  final TransactionCategory category;
  final String currencyCode;
  final bool showAmounts;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final isExpense = category.isExpense != false;
    final baseColor = isExpense
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;
    final color = parseHex(category.color) ?? baseColor;
    final icon = resolvePlatformIcon(
      category.icon,
      fallback: isExpense ? Icons.arrow_downward : Icons.arrow_upward,
    );

    return FinancePanel(
      radius: 22,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.16),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  category.name ?? '-',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const shad.Gap(6),
                if (category.amount != null) ...[
                  FinanceMaskedText(
                    context,
                    maskFinanceValue(
                      formatCurrency(category.amount!, currencyCode),
                      showAmounts: showAmounts,
                    ),
                    style: theme.typography.textSmall.copyWith(
                      color: color,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const shad.Gap(6),
                ],
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        color: color.withValues(alpha: 0.12),
                      ),
                      child: Text(
                        isExpense
                            ? context.l10n.financeExpense
                            : context.l10n.financeIncome,
                        style: theme.typography.xSmall.copyWith(
                          color: color,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (category.transactionCount != null) ...[
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 5,
                        ),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(999),
                          color: theme.colorScheme.muted.withValues(
                            alpha: 0.24,
                          ),
                        ),
                        child: Text(
                          '${category.transactionCount} '
                          '${context.l10n.financeTransactionCountShort}',
                          style: theme.typography.xSmall.copyWith(
                            color: theme.colorScheme.mutedForeground,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          if (onEdit != null)
            shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: onEdit,
              child: const Icon(Icons.edit_outlined, size: 16),
            ),
          if (onDelete != null)
            shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: onDelete,
              child: const Icon(Icons.delete_outline, size: 16),
            ),
        ],
      ),
    );
  }
}

class _TagCard extends StatelessWidget {
  const _TagCard({
    required this.tag,
    required this.currencyCode,
    required this.showAmounts,
    required this.onEdit,
    required this.onDelete,
  });

  final FinanceTag tag;
  final String currencyCode;
  final bool showAmounts;
  final VoidCallback? onEdit;
  final VoidCallback? onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final color = parseHex(tag.color) ?? theme.colorScheme.primary;

    return FinancePanel(
      radius: 22,
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.14),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(Icons.sell_outlined, color: color, size: 18),
          ),
          const shad.Gap(12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  tag.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.large.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (tag.description != null &&
                    tag.description!.trim().isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      tag.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.typography.textSmall.copyWith(
                        color: theme.colorScheme.mutedForeground,
                      ),
                    ),
                  ),
                if (tag.amount != null || tag.transactionCount != null) ...[
                  const shad.Gap(8),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      if (tag.amount != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: color.withValues(alpha: 0.12),
                          ),
                          child: FinanceMaskedText(
                            context,
                            maskFinanceValue(
                              formatCurrency(tag.amount!, currencyCode),
                              showAmounts: showAmounts,
                            ),
                            style: theme.typography.xSmall.copyWith(
                              color: color,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      if (tag.transactionCount != null)
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 8,
                            vertical: 5,
                          ),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(999),
                            color: theme.colorScheme.muted.withValues(
                              alpha: 0.24,
                            ),
                          ),
                          child: Text(
                            '${tag.transactionCount} '
                            '${context.l10n.financeTransactionCountShort}',
                            style: theme.typography.xSmall.copyWith(
                              color: theme.colorScheme.mutedForeground,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
          if (onEdit != null)
            shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: onEdit,
              child: const Icon(Icons.edit_outlined, size: 16),
            ),
          if (onDelete != null)
            shad.GhostButton(
              density: shad.ButtonDensity.icon,
              onPressed: onDelete,
              child: const Icon(Icons.delete_outline, size: 16),
            ),
        ],
      ),
    );
  }
}

extension on _TransactionCategoriesViewState {
  Widget _buildCategoriesContent(
    AppLocalizations l10n,
    EdgeInsets pagePadding,
    bool showAmounts,
  ) {
    if (_categoriesLoading) {
      return const FinanceListSkeleton(summaryHeight: 48);
    }
    if (_categoriesError != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        children: [
          FinanceEmptyState(
            icon: Icons.error_outline,
            title: l10n.commonSomethingWentWrong,
            body: _categoriesError!,
            action: shad.SecondaryButton(
              onPressed: _loadCategories,
              child: Text(l10n.commonRetry),
            ),
          ),
        ],
      );
    }
    if (_categories.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        children: [
          FinanceEmptyState(
            icon: Icons.category_outlined,
            title: l10n.financeNoCategories,
            body: l10n.financeManageCategoriesEmptyBody,
            action: canManageFinance(context, 'create_transactions')
                ? shad.SecondaryButton(
                    onPressed: _onCreateCategory,
                    child: Text(l10n.financeCreateCategory),
                  )
                : null,
          ),
        ],
      );
    }
    if (_workspaceCurrency == null || _workspaceCurrency!.trim().isEmpty) {
      return ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        itemCount: _categories.length.clamp(1, 6),
        separatorBuilder: (context, index) => const shad.Gap(8),
        itemBuilder: (context, index) => const _ManageFinanceCardSkeleton(),
      );
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: pagePadding,
      itemCount: _categories.length,
      separatorBuilder: (context, index) => const shad.Gap(8),
      itemBuilder: (context, index) {
        final category = _categories[index];
        return PendingSyncFrame(
          workspaceId: _categoriesWorkspaceId ?? '',
          entityId: category.id,
          feature: 'finance',
          child: _CategoryCard(
            category: category,
            currencyCode: _workspaceCurrency!,
            showAmounts: showAmounts,
            onEdit: canManageFinance(context, 'update_transactions')
                ? () => _onEdit(category)
                : null,
            onDelete: canManageFinance(context, 'delete_transactions')
                ? () => _onDelete(category)
                : null,
          ),
        );
      },
    );
  }

  Widget _buildTagsContent(
    AppLocalizations l10n,
    EdgeInsets pagePadding,
    bool showAmounts,
  ) {
    if (_tagsLoading) {
      return const FinanceListSkeleton(summaryHeight: 48);
    }
    if (_tagsError != null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        children: [
          FinanceEmptyState(
            icon: Icons.error_outline,
            title: l10n.commonSomethingWentWrong,
            body: _tagsError!,
            action: shad.SecondaryButton(
              onPressed: _loadTags,
              child: Text(l10n.commonRetry),
            ),
          ),
        ],
      );
    }
    if (_tags.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        children: [
          FinanceEmptyState(
            icon: Icons.sell_outlined,
            title: l10n.financeNoTags,
            body: l10n.financeManageTagsEmptyBody,
            action: canManageFinance(context, 'manage_finance')
                ? shad.SecondaryButton(
                    onPressed: _onCreateTag,
                    child: Text(l10n.financeCreateTag),
                  )
                : null,
          ),
        ],
      );
    }
    if (_workspaceCurrency == null || _workspaceCurrency!.trim().isEmpty) {
      return ListView.separated(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: pagePadding,
        itemCount: _tags.length.clamp(1, 6),
        separatorBuilder: (context, index) => const shad.Gap(8),
        itemBuilder: (context, index) => const _ManageFinanceCardSkeleton(),
      );
    }
    return ListView.separated(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: pagePadding,
      itemCount: _tags.length,
      separatorBuilder: (context, index) => const shad.Gap(8),
      itemBuilder: (context, index) {
        final tag = _tags[index];
        return PendingSyncFrame(
          workspaceId: _tagsWorkspaceId ?? '',
          entityId: tag.id,
          feature: 'finance',
          child: _TagCard(
            tag: tag,
            currencyCode: _workspaceCurrency!,
            showAmounts: showAmounts,
            onEdit: canManageFinance(context, 'manage_finance')
                ? () => _onEditTag(tag)
                : null,
            onDelete: canManageFinance(context, 'manage_finance')
                ? () => _onDeleteTag(tag)
                : null,
          ),
        );
      },
    );
  }
}
