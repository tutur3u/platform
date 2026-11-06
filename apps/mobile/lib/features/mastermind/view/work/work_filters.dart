import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// Search field, one chip per lane state with its count, and one chip per
/// product and per area present among the normal lanes. Security rows are
/// never searched or filtered.
class WorkFilters extends StatelessWidget {
  const WorkFilters({
    required this.controller,
    required this.states,
    required this.stateCounts,
    required this.selectedState,
    required this.products,
    required this.selectedProduct,
    required this.areas,
    required this.selectedArea,
    required this.onQuery,
    required this.onState,
    required this.onProduct,
    required this.onArea,
    super.key,
  });

  final TextEditingController controller;

  /// States to offer, in list order. Includes a selected state with no lanes,
  /// so the filter a Home chip set can always be cleared.
  final List<LaneState> states;
  final Map<LaneState, int> stateCounts;
  final LaneState? selectedState;
  final List<Product> products;
  final Product? selectedProduct;
  final List<Area> areas;
  final Area? selectedArea;
  final ValueChanged<String> onQuery;
  final ValueChanged<LaneState?> onState;
  final ValueChanged<Product?> onProduct;
  final ValueChanged<Area?> onArea;

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
            placeholder: l10n.mastermindWorkSearchPlaceholder,
            onChanged: onQuery,
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              AppChip(
                label: Text(l10n.mastermindAllFilter),
                selected: selectedState == null,
                inMutuallyExclusiveGroup: true,
                onSelected: (_) => onState(null),
              ),
              for (final state in states)
                AppChip(
                  label: Text(
                    l10n.mastermindCountState(
                      stateCounts[state] ?? 0,
                      MastermindLabels.laneState(l10n, state),
                    ),
                  ),
                  selected: selectedState == state,
                  inMutuallyExclusiveGroup: true,
                  onSelected: (_) =>
                      onState(selectedState == state ? null : state),
                ),
            ],
          ),
          if (products.length > 1) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final product in products)
                  AppChip(
                    label: Text(MastermindLabels.product(product)),
                    selected: selectedProduct == product,
                    onSelected: (_) =>
                        onProduct(selectedProduct == product ? null : product),
                  ),
              ],
            ),
          ],
          if (areas.length > 1) ...[
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final area in areas)
                  AppChip(
                    label: Text(MastermindLabels.area(l10n, area)),
                    selected: selectedArea == area,
                    onSelected: (_) =>
                        onArea(selectedArea == area ? null : area),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
