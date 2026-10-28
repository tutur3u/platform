import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/threads/threads_location.dart';
import 'package:mobile/features/mastermind/threads/threads_segmented_control.dart';
import 'package:mobile/features/mastermind/view/work/mastermind_work_page.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/threads` (P1a): the read-only Threads list that replaces Work
/// while `MASTERMIND_THREADS` is on. It is Work's own page, so the grouped
/// lanes, search, product and area filters, "Clear filters", Backlog, Staff
/// and the shared snapshot states all behave exactly as on Work. Only the
/// segment control and the group order differ: waiting, failed, running,
/// then idle. There is no send UI, and no row opens history.
class MastermindThreadsPage extends StatelessWidget {
  const MastermindThreadsPage({
    this.initialSegment = WorkSegment.lanes,
    this.initialState,
    this.initialProduct,
    this.initialArea,
    this.onSelection,
    super.key,
  });

  final WorkSegment initialSegment;
  final LaneState? initialState;
  final Product? initialProduct;
  final Area? initialArea;
  final ValueChanged<WorkSelection>? onSelection;

  @override
  Widget build(BuildContext context) => MastermindWorkPage(
    initialSegment: initialSegment,
    initialState: initialState,
    initialProduct: initialProduct,
    initialArea: initialArea,
    onSelection: onSelection,
    statePriority: threadStatePriority,
    segmentBarBuilder: _segmentBar,
  );

  static Widget _segmentBar(
    BuildContext context,
    WorkSegment selected,
    ValueChanged<WorkSegment> onChanged,
  ) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: ThreadsSegmentedControl<WorkSegment>(
        selected: selected,
        onChanged: onChanged,
        segments: [
          AppSegment(
            value: WorkSegment.lanes,
            label: l10n.mastermindThreadsTitle,
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
