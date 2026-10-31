import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/staff_model.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/work/lane_state_badge.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Staff segment: every role the hub reports with its title, model and
/// state, most urgent state first. Nothing here says when a role last worked
/// or how often: the hub does not publish it and the list never orders by it.
class WorkStaffSection extends StatelessWidget {
  const WorkStaffSection({required this.snapshot, super.key});

  final MastermindSnapshot snapshot;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final model = MastermindStaffModel.from(snapshot);
    if (model.isEmpty) {
      return MastermindGroup(
        caption: l10n.mastermindStaffGroup,
        children: [
          AppGroupedRow(
            leading: const AppIconTile(icon: LucideIcons.users),
            title: Text(l10n.mastermindStaffEmpty),
          ),
        ],
      );
    }
    final style = Theme.of(context).textTheme.bodySmall;
    return MastermindGroup(
      caption: l10n.mastermindStaffSummary(model.rows.length, model.running),
      children: [
        for (final staff in model.rows)
          AppGroupedRow(
            title: Text(staff.title),
            trailing: LaneStateBadge(state: staff.state),
            subtitle: Text(
              '${staff.role} · ${_modelText(l10n, staff)}',
              style: style,
            ),
          ),
      ],
    );
  }

  static String _modelText(AppLocalizations l10n, Staff staff) =>
      isUnknownStaffModel(staff)
      ? l10n.mastermindStaffUnknownModel
      : staff.model;
}
