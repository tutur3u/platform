import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/app_filter_bar.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/view/ship/ship_environment_tile.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/l10n/l10n.dart';

/// One product as a compact card: a header row with its name, how long its
/// release has been live and on what basis, then production and staging.
/// Failing products come first, with a destructive header glyph.
class ShipProductGroupSection extends StatelessWidget {
  const ShipProductGroupSection({
    required this.group,
    required this.asOf,
    super.key,
  });

  final ShipProductGroup group;

  /// The snapshot's own time, for the environments' relative ages.
  final DateTime asOf;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final age = group.release?.prodAgeSeconds;
    final release = group.release;
    return MastermindGroup(
      children: [
        AppGroupedRow(
          leading: AppIconTile(
            icon: group.failing ? AppIcons.warning : LucideIcons.rocket,
            tone: group.failing ? AppTone.destructive : AppTone.neutral,
          ),
          title: Text(MastermindLabels.releaseProduct(group.product)),
          // No release age: the line is left out rather than saying so.
          subtitle: age == null || release == null
              ? null
              : Text(
                  [
                    l10n.mastermindLiveAgo(
                      mastermindAgeText(l10n, Duration(seconds: age)),
                    ),
                    if (release.ageBasis != AgeBasis.unknown)
                      MastermindLabels.ageBasis(l10n, release.ageBasis),
                  ].join(' · '),
                ),
        ),
        for (final row in group.environments)
          ShipEnvironmentTile(row: row, asOf: asOf),
      ],
    );
  }
}

/// One scrolling row of product pills, All first, failing products marked
/// with a warning glyph. It never wraps. The filter is the URL's:
/// [onSelected] reports a change so the route can rewrite it.
class ShipProductFilter extends StatelessWidget {
  const ShipProductFilter({
    required this.products,
    required this.failing,
    required this.selected,
    required this.onSelected,
    super.key,
  });

  final List<ReleaseProduct> products;
  final Set<ReleaseProduct> failing;
  final ReleaseProduct? selected;
  final ValueChanged<ReleaseProduct?> onSelected;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
    child: AppFilterBar<ReleaseProduct?>(
      selected: selected,
      onSelected: onSelected,
      options: [
        AppFilterOption(
          value: null,
          label: context.l10n.mastermindShipAllProducts,
        ),
        for (final product in products)
          AppFilterOption(
            value: product,
            label: MastermindLabels.releaseProduct(product),
            icon: failing.contains(product) ? AppIcons.warning : null,
          ),
      ],
    ),
  );
}
