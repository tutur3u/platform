import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/components/app_tap_target.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// One row of product chips, shown only while two or more products are
/// present among the asks. It scrolls sideways rather than wrapping, so it
/// never takes more than one row above the list. Security rows are never
/// filtered.
class InboxFilters extends StatelessWidget {
  const InboxFilters({
    required this.products,
    required this.selected,
    required this.onProduct,
    super.key,
  });

  final List<Product> products;
  final Product? selected;
  final ValueChanged<Product?> onProduct;

  static const _target = Size.square(AppInterfaceTokens.minTouchTarget);

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    Widget chip(String label, Product? value) => AppTapTarget(
      minSize: _target,
      child: AppChip(
        label: Text(label),
        selected: selected == value,
        inMutuallyExclusiveGroup: true,
        onSelected: (_) =>
            onProduct(value == null || selected == value ? null : value),
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          spacing: AppSpacing.sm,
          children: [
            chip(l10n.mastermindAllFilter, null),
            for (final product in products)
              chip(MastermindLabels.product(product), product),
          ],
        ),
      ),
    );
  }
}
