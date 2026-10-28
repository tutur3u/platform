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
class WorkBacklogSection extends StatefulWidget {
  const WorkBacklogSection({required this.snapshot, super.key});

  final MastermindSnapshot snapshot;

  @override
  State<WorkBacklogSection> createState() => _WorkBacklogSectionState();
}

class _WorkBacklogSectionState extends State<WorkBacklogSection> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final model = MastermindBacklogModel.from(widget.snapshot, query: _query);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (!model.isEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
            child: AppSearchField(
              controller: _search,
              placeholder: l10n.mastermindBacklogSearchPlaceholder,
              onChanged: (value) => setState(() => _query = value),
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
