import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/backlog_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/work/lane_state_badge.dart';
import 'package:mobile/features/mastermind/view/work/work_lanes_body.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Backlog segment: items grouped by product, open first, with a search
/// field. Rows are read-only: no tap target and no id on screen.
///
/// The search lives with the page, like the Lanes one, so it survives a switch
/// to another segment.
class WorkBacklogSection extends StatelessWidget {
  const WorkBacklogSection({
    required this.snapshot,
    required this.controller,
    required this.query,
    required this.onQuery,
    super.key,
  });

  final MastermindSnapshot snapshot;
  final TextEditingController controller;
  final String query;
  final ValueChanged<String> onQuery;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final model = MastermindBacklogModel.from(snapshot, query: query);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!model.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
            child: AppSearchField(
              controller: controller,
              placeholder: l10n.mastermindBacklogSearchPlaceholder,
              onChanged: onQuery,
            ),
          ),
        if (model.isEmpty)
          AppGroupedSection.spaced(
            caption: l10n.mastermindBacklogLabel,
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: AppIcons.check),
                title: Text(l10n.mastermindBacklogEmptyTitle),
              ),
            ],
          )
        else if (model.hasNoMatches)
          AppGroupedSection.spaced(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.searchX),
                title: Text(l10n.mastermindBacklogNoMatches),
              ),
            ],
          ),
        for (final group in model.groups)
          AppGroupedSection.spaced(
            caption: group.product == null
                ? l10n.mastermindNoProduct
                : MastermindLabels.product(group.product!),
            captionTrailing: Text('${group.items.length}'),
            children: [
              for (final item in group.items)
                AppGroupedRow(
                  title: Text(item.title),
                  trailing: LaneStateBadge(state: _asLane(item.state)),
                ),
            ],
          ),
        if (model.security.isNotEmpty) WorkSecurityGroup(items: model.security),
      ],
    );
  }
}

LaneState _asLane(ItemState state) => switch (state) {
  ItemState.open => LaneState.open,
  ItemState.answered => LaneState.answered,
  ItemState.withdrawn => LaneState.withdrawn,
};
