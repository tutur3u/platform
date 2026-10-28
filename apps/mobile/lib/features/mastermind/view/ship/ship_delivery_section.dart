import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/l10n/l10n.dart';

/// Pull requests and merges, read-only: the open count and the merge-to-live
/// median each product last reported, and how many production releases the
/// window saw (a lower bound). Nothing here opens a pull request or merges.
class ShipDeliverySection extends StatelessWidget {
  const ShipDeliverySection({required this.delivery, super.key});

  final ShipDelivery delivery;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    // Missing or unavailable coverage reports no numbers worth trusting, so it
    // is said once instead of row by row.
    final noSource =
        delivery.coverage == Coverage.missing ||
        delivery.coverage == Coverage.unavailable;
    final empty = noSource || delivery.isEmpty;
    return AppGroupedSection.spaced(
      caption: l10n.mastermindShipPullRequestsTitle,
      footer: delivery.coverage == Coverage.ok || empty
          ? null
          : MastermindLabels.coverage(l10n, delivery.coverage),
      children: [
        if (empty)
          AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.gitPullRequest),
            title: Text(
              noSource
                  ? MastermindLabels.coverage(l10n, delivery.coverage)
                  : l10n.mastermindShipNoPullRequests,
            ),
          )
        else ...[
          if (delivery.releasesObserved case final count?)
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.rocket),
              title: Text(l10n.mastermindSummaryShipsLowerBound(count)),
            ),
          for (final pr in delivery.openPrs)
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.gitPullRequest),
              title: Text(MastermindLabels.product(pr.product)),
              subtitle: Text(l10n.mastermindChartOpenPrs),
              trailing: SizedBox(
                width: 120,
                child: Text(
                  pr.count == null
                      ? l10n.mastermindUnavailable
                      : l10n.mastermindShipOpenCount(pr.count!),
                ),
              ),
            ),
          for (final merge in delivery.mergeToLive)
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.gitMerge),
              title: Text(MastermindLabels.product(merge.product)),
              subtitle: Text(
                '${l10n.mastermindChartMergeToLive} · '
                '${l10n.mastermindSamples(merge.samples)}',
              ),
              trailing: SizedBox(
                width: 120,
                child: Text(
                  merge.medianMinutes == null
                      ? l10n.mastermindUnavailable
                      : l10n.mastermindUnitMinutes(
                          merge.medianMinutes!.round().toString(),
                        ),
                ),
              ),
            ),
        ],
      ],
    );
  }
}
