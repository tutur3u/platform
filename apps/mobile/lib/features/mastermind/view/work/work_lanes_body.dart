import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/mastermind/view/work/lane_tile.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Lanes segment's list: one section per state, then the Security group.
class WorkLanesBody extends StatelessWidget {
  const WorkLanesBody({
    required this.model,
    required this.onClearFilters,
    super.key,
  });

  final MastermindWorkModel model;
  final VoidCallback onClearFilters;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (model.isEmpty)
          MastermindGroup(
            caption: l10n.mastermindLanesLabel,
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.briefcase),
                title: Text(l10n.mastermindWorkEmpty),
              ),
            ],
          )
        else if (model.hasNoMatches)
          MastermindGroup(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.searchX),
                title: Text(l10n.mastermindWorkNoMatches),
              ),
              AppGroupedRow(
                leading: const AppIconTile(icon: LucideIcons.filterX),
                title: Text(l10n.mastermindWorkClearFilters),
                onTap: onClearFilters,
              ),
            ],
          ),
        for (final group in model.groups)
          MastermindGroup(
            caption: toBeginningOfSentenceCase(
              MastermindLabels.laneState(l10n, group.state),
              l10n.localeName,
            ),
            captionTrailing: Text('${group.lanes.length}'),
            children: [for (final lane in group.lanes) LaneTile(lane: lane)],
          ),
        if (model.security.isNotEmpty) WorkSecurityGroup(items: model.security),
      ],
    );
  }
}

/// The trailing Security group every Work segment shares: one line per
/// product, no count, no tap target.
class WorkSecurityGroup extends StatelessWidget {
  const WorkSecurityGroup({required this.items, super.key});

  final List<SecurityItem> items;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return MastermindGroup(
      caption: l10n.mastermindSecurityGroup,
      children: [
        for (final item in items)
          AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.shield),
            title: Text(securityLine(l10n, item)),
            trailing: MastermindStatusChip(
              label: MastermindLabels.laneState(l10n, item.state),
            ),
          ),
      ],
    );
  }
}
