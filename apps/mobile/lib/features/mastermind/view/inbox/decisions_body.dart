import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/decisions_model.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/view/inbox/decision_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/decisions_filters.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Decisions segment: filter chips, then the journal newest first, one
/// section per GMT+7 day, then the "older decisions" footer.
class DecisionsBody extends StatelessWidget {
  const DecisionsBody({
    required this.model,
    required this.product,
    required this.reversible,
    required this.onProduct,
    required this.onReversible,
    super.key,
  });

  final MastermindDecisionsModel model;
  final Product? product;
  final bool? reversible;
  final ValueChanged<Product?> onProduct;
  final ValueChanged<bool?> onReversible;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!model.isEmpty)
          DecisionsFilters(
            products: model.products,
            selectedProduct: product,
            showReversible: model.hasReversibleChoice,
            selectedReversible: reversible,
            onProduct: onProduct,
            onReversible: onReversible,
          ),
        if (model.isEmpty)
          AppGroupedSection.spaced(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.scrollText),
                title: Text(l10n.mastermindDecisionsJournalEmpty),
              ),
            ],
          )
        else if (model.hasNoMatches)
          AppGroupedSection.spaced(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.searchX),
                title: Text(l10n.mastermindDecisionsNoMatches),
              ),
            ],
          ),
        for (final day in model.days)
          AppGroupedSection.spaced(
            caption: Gmt7.date(day.at, locale),
            captionTrailing: Text('${day.decisions.length}'),
            children: [
              for (final decision in day.decisions)
                DecisionTile(decision: decision),
            ],
          ),
        if (model.skipped > 0)
          Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppLayout.rowHorizontalPadding,
            ),
            child: Text(l10n.mastermindDecisionsSkipped(model.skipped)),
          ),
      ],
    );
  }
}
