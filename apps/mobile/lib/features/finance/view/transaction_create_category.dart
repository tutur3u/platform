part of 'transaction_detail_sheet.dart';

class _CreateCategoryCard extends StatelessWidget {
  const _CreateCategoryCard({
    required this.categories,
    required this.selectedId,
    required this.isLoading,
    required this.tone,
    required this.onChanged,
  });

  final List<TransactionCategory> categories;
  final String? selectedId;
  final bool isLoading;
  final FinanceTone tone;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    return AppCard(
      padding: const EdgeInsets.all(8),
      semanticLabel: context.l10n.financeCategory,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 4, 8, 4),
            child: Text(
              context.l10n.financeCategory,
              style: tokens.typography.heading,
            ),
          ),
          if (isLoading)
            const FinanceSkeletonBlock(height: 76)
          else if (categories.isEmpty)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Text(
                context.l10n.financeNoCategories,
                style: tokens.typography.bodySm,
              ),
            )
          else
            for (var start = 0; start < categories.length; start += 4)
              IntrinsicHeight(
                child: Row(
                  spacing: 4,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    for (var index = start; index < start + 4; index++)
                      Expanded(
                        child: index >= categories.length
                            ? const SizedBox.shrink()
                            : _CreateCategoryCell(
                                category: categories[index],
                                selected: selectedId == categories[index].id,
                                tone: tone,
                                onChanged: onChanged,
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

class _CreateCategoryCell extends StatelessWidget {
  const _CreateCategoryCell({
    required this.category,
    required this.selected,
    required this.tone,
    required this.onChanged,
  });

  final TransactionCategory category;
  final bool selected;
  final FinanceTone tone;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final radius = tokens.borderRadiusMd;
    return Semantics(
      checked: selected,
      inMutuallyExclusiveGroup: true,
      child: Material(
        color: selected ? tokens.colorScheme.accent : Colors.transparent,
        borderRadius: radius,
        child: InkWell(
          borderRadius: radius,
          onTap: onChanged == null ? null : () => onChanged!(category.id),
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 76),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 2),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FinanceToneIcon(
                    icon: resolvePlatformIcon(
                      category.icon,
                      fallback: Icons.category_outlined,
                    ),
                    tone: tone,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    category.name ?? '—',
                    textAlign: TextAlign.center,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.caption,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
