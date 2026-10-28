import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// Search field plus one chip per product present among the normal items.
/// Security rows are never searched or filtered.
class InboxFilters extends StatelessWidget {
  const InboxFilters({
    required this.controller,
    required this.products,
    required this.selected,
    required this.onQuery,
    required this.onProduct,
    super.key,
  });

  final TextEditingController controller;
  final List<Product> products;
  final Product? selected;
  final ValueChanged<String> onQuery;
  final ValueChanged<Product?> onProduct;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppSearchField(
            controller: controller,
            placeholder: l10n.mastermindInboxSearchPlaceholder,
            onChanged: onQuery,
          ),
          if (products.length > 1) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                AppChip(
                  label: Text(l10n.mastermindAllFilter),
                  selected: selected == null,
                  inMutuallyExclusiveGroup: true,
                  onSelected: (_) => onProduct(null),
                ),
                for (final product in products)
                  AppChip(
                    label: Text(MastermindLabels.product(product)),
                    selected: selected == product,
                    inMutuallyExclusiveGroup: true,
                    onSelected: (_) =>
                        onProduct(selected == product ? null : product),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
