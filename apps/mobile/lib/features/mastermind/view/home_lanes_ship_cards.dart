import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/l10n/l10n.dart';

/// Counts by lane state as text and glyph chips; failed lanes carry a warning.
class HomeLanesCard extends StatelessWidget {
  const HomeLanesCard({required this.model, super.key});

  final MastermindHomeModel model;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedSection.spaced(
      caption: l10n.mastermindLanesAtAGlance,
      children: [
        Padding(
          padding: const EdgeInsets.all(AppLayout.rowHorizontalPadding),
          child: Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final state in MastermindHomeModel.laneStatesAtAGlance)
                AppChip(
                  avatar: Icon(_icon(state, model.laneCounts[state] ?? 0)),
                  label: Text(
                    l10n.mastermindCountState(
                      model.laneCounts[state] ?? 0,
                      MastermindLabels.laneState(l10n, state),
                    ),
                  ),
                  onPressed: () => context.go(
                    Uri(
                      path: Routes.mastermindWork,
                      queryParameters: {'state': state.wireName},
                    ).toString(),
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  static IconData _icon(LaneState state, int count) => switch (state) {
    LaneState.failed when count > 0 => AppIcons.warning,
    LaneState.failed => LucideIcons.circleX,
    LaneState.running => LucideIcons.play,
    LaneState.waiting => LucideIcons.hourglass,
    _ => LucideIcons.list,
  };
}

/// Failing environments first, then one row per product release.
class HomeShipCard extends StatelessWidget {
  const HomeShipCard({required this.model, super.key});

  final MastermindHomeModel model;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedSection.spaced(
      caption: l10n.mastermindTabShip,
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
            subtitle: Text(
              l10n.mastermindDeployCiLine(
                MastermindLabels.deployStatus(l10n, row.deployStatus),
                MastermindLabels.ciState(l10n, row.ciState),
              ),
            ),
            trailing: AppBadge(
              variant: AppBadgeVariant.warning,
              child: Text(l10n.mastermindNeedsAttention),
            ),
            // Opens Ship on this product, where its environments are listed.
            onTap: () => context.go(shipLocation(product: row.product)),
          ),
        for (final release in model.releases)
          AppGroupedRow(
            showChevron: true,
            onTap: () => context.go(shipLocation(product: release.product)),
            title: Text(MastermindLabels.releaseProduct(release.product)),
            subtitle: Text(MastermindLabels.ageBasis(l10n, release.ageBasis)),
            trailing: Text(
              release.prodAgeSeconds == null
                  ? l10n.mastermindUnknown
                  : l10n.mastermindLiveAgo(
                      mastermindAgeText(
                        l10n,
                        Duration(seconds: release.prodAgeSeconds!),
                      ),
                    ),
            ),
          ),
      ],
    );
  }
}
