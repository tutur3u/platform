import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/view/ship/ship_environment_tile.dart';
import 'package:mobile/l10n/l10n.dart';

/// One product: how long its release has been live, then production and
/// staging. A failing product is listed first by the model.
class ShipProductGroupSection extends StatelessWidget {
  const ShipProductGroupSection({required this.group, super.key});

  final ShipProductGroup group;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final release = group.release;
    return AppGroupedSection.spaced(
      caption: MastermindLabels.releaseProduct(group.product),
      children: [
        if (release != null)
          AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.rocket),
            title: Text(
              release.prodAgeSeconds == null
                  ? l10n.mastermindUnknown
                  : l10n.mastermindLiveAgo(
                      mastermindAgeText(
                        l10n,
                        Duration(seconds: release.prodAgeSeconds!),
                      ),
                    ),
            ),
            subtitle: Text(MastermindLabels.ageBasis(l10n, release.ageBasis)),
          ),
        for (final row in group.environments) ShipEnvironmentTile(row: row),
        if (group.environments.isEmpty)
          AppGroupedRow(title: Text(l10n.mastermindShipNoEnvironments)),
      ],
    );
  }
}

/// One chip per product present, only while there is a choice. The filter is
/// the URL's: [onSelected] reports a change so the route can rewrite it.
class ShipProductFilter extends StatelessWidget {
  const ShipProductFilter({
    required this.products,
    required this.selected,
    required this.onSelected,
    super.key,
  });

  final List<ReleaseProduct> products;
  final ReleaseProduct? selected;
  final ValueChanged<ReleaseProduct?> onSelected;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
    child: Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        for (final product in products)
          AppChip(
            label: Text(MastermindLabels.releaseProduct(product)),
            selected: selected == product,
            onSelected: (_) => onSelected(selected == product ? null : product),
          ),
      ],
    ),
  );
}
