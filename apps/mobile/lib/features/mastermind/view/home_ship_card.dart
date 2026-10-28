import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/features/mastermind/view/widgets/reported_text.dart';
import 'package:mobile/features/mastermind/view/widgets/show_all_row.dart';
import 'package:mobile/l10n/l10n.dart';

/// Failing environments first, then the three most recent releases, then
/// "Show all N" into Ship. A shared age basis moves into the caption instead
/// of repeating under every row; a release with no age reads `—`.
class HomeShipCard extends StatelessWidget {
  const HomeShipCard({required this.model, super.key});

  final MastermindHomeModel model;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final shared = model.sharedReleaseBasis;
    // Past 130% text, trailing badges and ages move under the title.
    final large = mastermindLargeText(context);
    return AppGroupedSection.spaced(
      caption: shared == null
          ? l10n.mastermindTabShip
          : l10n.mastermindSectionWithBasis(
              l10n.mastermindTabShip,
              MastermindLabels.ageBasis(l10n, shared),
            ),
      children: [
        if (model.failingEnvironments.isEmpty && model.releases.isEmpty)
          AppGroupedRow(title: Text(l10n.mastermindShipEmpty)),
        for (final row in model.failingEnvironments)
          AppGroupedRow(
            showChevron: true,
            leading: const AppIconTile(
              icon: AppIcons.warning,
              tone: AppTone.warning,
            ),
            title: Text(
              '${MastermindLabels.releaseProduct(row.product)} · '
              '${MastermindLabels.environment(l10n, row.environment)}',
            ),
            subtitle: _stacked([
              Text(
                l10n.mastermindDeployCiLine(
                  MastermindLabels.deployStatus(l10n, row.deployStatus),
                  MastermindLabels.ciState(l10n, row.ciState),
                ),
              ),
              if (large) _needsAttention(l10n),
            ]),
            trailing: large ? null : _needsAttention(l10n),
            // Opens Ship on this product, where its environments are listed.
            onTap: () => context.go(shipLocation(product: row.product)),
          ),
        for (final release in model.releases)
          AppGroupedRow(
            showChevron: true,
            onTap: () => context.go(shipLocation(product: release.product)),
            title: Text(MastermindLabels.releaseProduct(release.product)),
            subtitle: _stacked([
              if (shared == null && release.ageBasis != AgeBasis.unknown)
                Text(MastermindLabels.ageBasis(l10n, release.ageBasis)),
              if (large) _liveAge(l10n, release),
            ]),
            trailing: large ? null : _liveAge(l10n, release),
          ),
        if (model.releaseCount > model.releases.length)
          MastermindShowAllRow(
            count: model.releaseCount,
            onTap: () => context.go(shipLocation()),
          ),
      ],
    );
  }
}

Widget _needsAttention(AppLocalizations l10n) => AppBadge(
  variant: AppBadgeVariant.warning,
  child: Text(l10n.mastermindNeedsAttention),
);

/// "Live 1 h ago", or `—` when the release has no age.
Widget _liveAge(AppLocalizations l10n, ProductRelease release) => ReportedText(
  release.prodAgeSeconds == null
      ? null
      : l10n.mastermindLiveAgo(
          mastermindAgeText(l10n, Duration(seconds: release.prodAgeSeconds!)),
        ),
);

/// A subtitle of zero or more lines; null when there is nothing to show.
Widget? _stacked(List<Widget> lines) => switch (lines) {
  [] => null,
  [final only] => only,
  _ => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    spacing: AppSpacing.xxs,
    children: lines,
  ),
};
