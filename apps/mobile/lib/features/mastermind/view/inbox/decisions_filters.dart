import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// One chip per product present in the journal, and Reversible / Not
/// reversible while the journal holds both.
class DecisionsFilters extends StatelessWidget {
  const DecisionsFilters({
    required this.products,
    required this.selectedProduct,
    required this.showReversible,
    required this.selectedReversible,
    required this.onProduct,
    required this.onReversible,
    super.key,
  });

  final List<Product> products;
  final Product? selectedProduct;
  final bool showReversible;
  final bool? selectedReversible;
  final ValueChanged<Product?> onProduct;
  final ValueChanged<bool?> onReversible;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final productChips = products.length > 1;
    if (!productChips && !showReversible) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (productChips)
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                AppChip(
                  label: Text(l10n.mastermindAllFilter),
                  selected: selectedProduct == null,
                  inMutuallyExclusiveGroup: true,
                  onSelected: (_) => onProduct(null),
                ),
                for (final product in products)
                  AppChip(
                    label: Text(MastermindLabels.product(product)),
                    selected: selectedProduct == product,
                    inMutuallyExclusiveGroup: true,
                    onSelected: (_) =>
                        onProduct(selectedProduct == product ? null : product),
                  ),
              ],
            ),
          if (productChips && showReversible)
            const SizedBox(height: AppSpacing.sm),
          if (showReversible)
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final (value, label) in [
                  (true, l10n.mastermindReversible),
                  (false, l10n.mastermindReversibleNo),
                ])
                  AppChip(
                    label: Text(label),
                    selected: selectedReversible == value,
                    inMutuallyExclusiveGroup: true,
                    onSelected: (_) => onReversible(
                      selectedReversible == value ? null : value,
                    ),
                  ),
              ],
            ),
        ],
      ),
    );
  }
}
