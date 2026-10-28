import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/work_model.dart';
import 'package:mobile/features/mastermind/threads/threads_list_model.dart';
import 'package:mobile/features/mastermind/threads/threads_segmented_control.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/mastermind/view/work/lane_tile.dart';
import 'package:mobile/features/mastermind/view/work/work_backlog_section.dart';
import 'package:mobile/features/mastermind/view/work/work_lanes_body.dart';
import 'package:mobile/features/mastermind/view/work/work_staff_section.dart';
import 'package:mobile/l10n/l10n.dart';

typedef ThreadsSelection = ({WorkSegment segment, LaneState? status});

/// `/mastermind/threads` (P1a): the read-only Threads list that replaces Work
/// while `MASTERMIND_THREADS` is on. Every segment reads the shared snapshot
/// through [MastermindSection], so access loss, rate limits, a missing
/// snapshot and refresh behave exactly as on the other tabs. There is no send
/// UI, and no row opens history: P1b history needs a v2 `thread_ref`.
class MastermindThreadsPage extends StatefulWidget {
  const MastermindThreadsPage({
    this.initialSegment = WorkSegment.lanes,
    this.initialStatus,
    this.onSelection,
    super.key,
  });

  final WorkSegment initialSegment;
  final LaneState? initialStatus;
  final ValueChanged<ThreadsSelection>? onSelection;

  @override
  State<MastermindThreadsPage> createState() => _MastermindThreadsPageState();
}

class _MastermindThreadsPageState extends State<MastermindThreadsPage> {
  final _search = TextEditingController();
  final _backlogSearch = TextEditingController();
  String _query = '';
  String _backlogQuery = '';
  late WorkSegment _segment = widget.initialSegment;
  late LaneState? _status = widget.initialStatus;

  @override
  void didUpdateWidget(MastermindThreadsPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.initialSegment != widget.initialSegment) {
      _segment = widget.initialSegment;
    }
    if (oldWidget.initialStatus != widget.initialStatus) {
      _status = widget.initialStatus;
    }
  }

  @override
  void dispose() {
    _search.dispose();
    _backlogSearch.dispose();
    super.dispose();
  }

  void _select(VoidCallback change) {
    setState(change);
    widget.onSelection?.call((segment: _segment, status: _status));
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return MastermindSection(
      builder: (context, ready, freshness) => AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverList.list(
            children: [
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: ThreadsSegmentedControl<WorkSegment>(
                  selected: _segment,
                  onChanged: (value) => _select(() => _segment = value),
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
              ),
              ...switch (_segment) {
                WorkSegment.lanes => _threads(context, ready.snapshot),
                WorkSegment.backlog => [
                  WorkBacklogSection(
                    snapshot: ready.snapshot,
                    controller: _backlogSearch,
                    query: _backlogQuery,
                    onQuery: (value) => setState(() => _backlogQuery = value),
                  ),
                ],
                WorkSegment.staff => [
                  WorkStaffSection(snapshot: ready.snapshot),
                ],
              },
            ],
          ),
        ],
      ),
    );
  }

  List<Widget> _threads(BuildContext context, MastermindSnapshot snapshot) {
    final l10n = context.l10n;
    final model = ThreadsListModel.from(
      snapshot,
      query: _query,
      status: _status,
    );
    return [
      AppSearchField(
        controller: _search,
        placeholder: l10n.mastermindThreadsSearch,
        onChanged: (value) => setState(() => _query = value),
      ),
      const SizedBox(height: AppSpacing.sm),
      Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          AppChip(
            label: Text(l10n.mastermindThreadsAll),
            selected: _status == null,
            inMutuallyExclusiveGroup: true,
            onSelected: (_) => _select(() => _status = null),
          ),
          for (final status in model.statuses(_status))
            AppChip(
              label: Text(
                l10n.mastermindCountState(
                  model.counts[status] ?? 0,
                  MastermindLabels.laneState(l10n, status),
                ),
              ),
              selected: _status == status,
              inMutuallyExclusiveGroup: true,
              onSelected: (_) =>
                  _select(() => _status = _status == status ? null : status),
            ),
        ],
      ),
      const SizedBox(height: AppSpacing.sm),
      AppGroupedSection.spaced(
        caption: l10n.mastermindThreadsTitle,
        captionTrailing: Text('${model.lanes.length}'),
        children: [
          if (model.lanes.isEmpty)
            AppGroupedRow(
              leading: const AppIconTile(icon: LucideIcons.searchX),
              title: Text(l10n.mastermindThreadsEmpty),
            ),
          for (final lane in model.lanes)
            LaneTile(key: ValueKey(lane.id), lane: lane),
        ],
      ),
      if (model.security.isNotEmpty) WorkSecurityGroup(items: model.security),
    ];
  }
}
