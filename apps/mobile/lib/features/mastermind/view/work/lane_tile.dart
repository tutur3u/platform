import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/lane_text.dart';
import 'package:mobile/features/mastermind/view/work/lane_state_badge.dart';
import 'package:mobile/l10n/l10n.dart';

/// One lane in the Work list: title, role and model, how long it has been in
/// its state, an ETA when there is one, and product, area and kind chips.
///
/// Tapping the row pushes the detail by the lane's opaque id, so Back returns
/// to the same filtered list.
class LaneTile extends StatelessWidget {
  const LaneTile({required this.lane, super.key});

  final Lane lane;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final style = Theme.of(context).textTheme.bodySmall;
    final eta = laneEtaLine(l10n, lane);
    return AppGroupedRow(
      title: Text(lane.title),
      showChevron: true,
      trailing: LaneStateBadge(state: lane.state),
      onTap: () => context.push(Routes.mastermindWorkLanePath(lane.id)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '${HubField.text(context.l10n, lane.role)} · '
            '${HubField.text(context.l10n, lane.providerModel)}',
            style: style,
          ),
          Text(
            eta == null
                ? laneAgeLine(l10n, lane)
                : '${laneAgeLine(l10n, lane)} · $eta',
            style: style,
          ),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              if (lane.product case final product?)
                AppBadge.outline(
                  child: Text(MastermindLabels.product(product)),
                ),
              if (lane.area case final area?)
                AppBadge.outline(
                  child: Text(MastermindLabels.area(l10n, area)),
                ),
              if (lane.kind case final kind?)
                AppBadge(child: Text(MastermindLabels.laneKind(l10n, kind))),
            ],
          ),
        ],
      ),
    );
  }
}
