import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_freshness_line.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_section.dart';
import 'package:mobile/l10n/l10n.dart';

enum FleetGrouping { machine, provider }

FleetGrouping fleetGroupingFromQuery(String? raw) =>
    raw == 'provider' ? FleetGrouping.provider : FleetGrouping.machine;

FleetLaneState? fleetLaneStateFromQuery(String? raw) =>
    FleetLaneState.values.where((s) => s.name == raw).firstOrNull;

/// `/mastermind/work`: lanes grouped by machine or provider, filtered by
/// state. Filter and grouping are screen state seeded from the URL.
class FleetWorkPage extends StatefulWidget {
  const FleetWorkPage({
    this.initialState,
    this.initialGrouping = FleetGrouping.machine,
    this.now,
    super.key,
  });

  final FleetLaneState? initialState;
  final FleetGrouping initialGrouping;
  final DateTime Function()? now;

  @override
  State<FleetWorkPage> createState() => _FleetWorkPageState();
}

class _FleetWorkPageState extends State<FleetWorkPage> {
  late FleetLaneState? _state = widget.initialState;
  late FleetGrouping _grouping = widget.initialGrouping;

  @override
  Widget build(BuildContext context) => FleetSection(
    builder: (context, snapshot, state) {
      final l10n = context.l10n;
      final lanes = snapshot.lanes
          .where((lane) => _state == null || lane.state == _state)
          .toList();
      final groups = _group(snapshot, lanes, l10n);
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverList.list(
            children: [
              FleetFreshnessLine(state: state, now: widget.now),
              AppSegmentedControl<FleetGrouping>(
                segments: [
                  AppSegment(
                    value: FleetGrouping.machine,
                    label: l10n.mastermindFleetByMachine,
                    icon: LucideIcons.server,
                  ),
                  AppSegment(
                    value: FleetGrouping.provider,
                    label: l10n.mastermindFleetByProvider,
                    icon: LucideIcons.cpu,
                  ),
                ],
                selected: _grouping,
                onChanged: (value) => setState(() => _grouping = value),
              ),
              const SizedBox(height: AppSpacing.md),
              AppFilterBar<FleetLaneState?>(
                options: [
                  AppFilterOption(value: null, label: l10n.commonAll),
                  for (final laneState in FleetLaneState.values)
                    AppFilterOption(
                      value: laneState,
                      label: laneState.label(l10n),
                      count: snapshot.counts.of(laneState),
                    ),
                ],
                selected: _state,
                onSelected: (value) => setState(() => _state = value),
              ),
              const SizedBox(height: AppSpacing.lg),
              if (lanes.isEmpty)
                AppStateMessage.inline(
                  icon: LucideIcons.listChecks,
                  title: l10n.mastermindFleetLanesEmpty,
                ),
              for (final (title, groupLanes) in groups)
                AppGroupedSection.spaced(
                  caption: '$title · ${groupLanes.length}',
                  children: [
                    for (final lane in groupLanes)
                      _LaneRow(lane: lane, now: widget.now),
                  ],
                ),
            ],
          ),
        ],
      );
    },
  );

  List<(String, List<FleetLane>)> _group(
    FleetSnapshot snapshot,
    List<FleetLane> lanes,
    AppLocalizations l10n,
  ) {
    final labels = {for (final m in snapshot.machines) m.id: m.label};
    String key(FleetLane lane) => switch (_grouping) {
      FleetGrouping.machine => labels[lane.machineId] ?? lane.machineId,
      FleetGrouping.provider =>
        lane.provider ?? l10n.mastermindFleetOtherProvider,
    };
    final grouped = <String, List<FleetLane>>{};
    for (final lane in lanes) {
      (grouped[key(lane)] ??= []).add(lane);
    }
    // Groups with running work first, then by size; lanes keep the
    // publisher's order (state, then most recent).
    final entries = grouped.entries.toList()
      ..sort((a, b) {
        final active = b.value
            .where(fleetLaneIsActive)
            .length
            .compareTo(a.value.where(fleetLaneIsActive).length);
        return active != 0 ? active : b.value.length.compareTo(a.value.length);
      });
    return [for (final e in entries) (e.key, e.value)];
  }
}

class _LaneRow extends StatelessWidget {
  const _LaneRow({required this.lane, this.now});

  final FleetLane lane;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final current = (now ?? DateTime.now)().toUtc();
    return AppRichRow(
      title: lane.title,
      leading: AppIconTile(icon: lane.state.icon, tone: lane.state.tone),
      meta: [
        if (lane.project case final project?)
          AppMetaItem(icon: LucideIcons.folder, label: project),
        if (lane.model ?? lane.provider case final model?)
          AppMetaItem(icon: LucideIcons.cpu, label: model),
      ],
      trailing: AppBadge(
        variant: switch (lane.state) {
          FleetLaneState.running => AppBadgeVariant.success,
          FleetLaneState.waiting => AppBadgeVariant.warning,
          FleetLaneState.failed => AppBadgeVariant.destructive,
          FleetLaneState.queued ||
          FleetLaneState.idle => AppBadgeVariant.outline,
        },
        child: Text(lane.state.label(l10n)),
      ),
      trailingCaption: fleetAge(l10n, lane.updatedAt, current),
    );
  }
}
