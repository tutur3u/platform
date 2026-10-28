import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/l10n/l10n.dart';

/// Lanes, Backlog and Staff: three views of the same Work tab.
class WorkSegmentBar extends StatelessWidget {
  const WorkSegmentBar({
    required this.selected,
    required this.onChanged,
    super.key,
  });

  final WorkSegment selected;
  final ValueChanged<WorkSegment> onChanged;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppLayout.sectionGap),
      child: AppSegmentedControl<WorkSegment>(
        selected: selected,
        onChanged: onChanged,
        segments: [
          AppSegment(
            value: WorkSegment.lanes,
            label: l10n.mastermindLanesLabel,
          ),
          AppSegment(
            value: WorkSegment.backlog,
            label: l10n.mastermindBacklogLabel,
          ),
          AppSegment(
            value: WorkSegment.staff,
            label: l10n.mastermindStaffGroup,
          ),
        ],
      ),
    );
  }
}
