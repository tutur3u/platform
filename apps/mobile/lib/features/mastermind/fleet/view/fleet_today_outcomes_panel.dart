import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/l10n/l10n.dart';

/// The fleet's day is Indochina Time (UTC+7, no daylight saving), as the
/// publisher counts it.
const _ictOffset = Duration(hours: 7);

/// Start of the ICT day that holds [now], in UTC.
DateTime fleetIctDayStart(DateTime now) {
  final wall = now.toUtc().add(_ictOffset);
  return DateTime.utc(wall.year, wall.month, wall.day).subtract(_ictOffset);
}

/// What the row for one machine says about today's outcomes.
sealed class FleetMachineOutcome {
  const FleetMachineOutcome();
}

/// Classified run outcomes the publisher read from that machine's T3 history.
final class FleetClassifiedOutcome extends FleetMachineOutcome {
  const FleetClassifiedOutcome(this.outcomes);
  final FleetTodayOutcomes outcomes;
}

/// A linked machine's lanes in the snapshot: T3's peer link lists thread
/// status but not failure kinds, so failures are counted, not classified.
/// [retried] counts failures a newer attempt superseded; that attempt may
/// still be running, so it is not a confirmed recovery.
final class FleetLaneOutcome extends FleetMachineOutcome {
  const FleetLaneOutcome({
    required this.failed,
    required this.retried,
    this.partial = false,
  });
  final int failed;
  final int retried;

  /// The snapshot's lane cap may have left out some of today's lanes.
  final bool partial;
}

/// Nothing to count: the machine is offline, or its outcomes are not today's.
final class FleetNoOutcome extends FleetMachineOutcome {
  const FleetNoOutcome({required this.offline});
  final bool offline;
}

/// Today's outcome for [machine]. Machines without classified outcomes (every
/// linked machine, whose failure records stay on that machine) fall back to
/// their failed and retried lanes updated since the ICT day began.
FleetMachineOutcome fleetMachineOutcome(
  FleetSnapshot snapshot,
  FleetMachine machine,
  DateTime now,
) {
  final classified = machine.todayOutcomes;
  if (classified != null) {
    return classified.isToday(now)
        ? FleetClassifiedOutcome(classified)
        : const FleetNoOutcome(offline: false);
  }
  if (fleetMachineStatusAt(machine, now) == FleetMachineStatus.offline) {
    return const FleetNoOutcome(offline: true);
  }
  final dayStart = fleetIctDayStart(now);
  var failed = 0;
  var retried = 0;
  for (final lane in snapshot.lanes) {
    if (lane.machineId != machine.id || lane.updatedAt.isBefore(dayStart)) {
      continue;
    }
    if (lane.state == FleetLaneState.failed) {
      failed++;
    } else if (lane.state == FleetLaneState.idle &&
        (lane.resolution == FleetLaneResolution.recovered ||
            lane.resolution == FleetLaneResolution.quotaRecovered)) {
      retried++;
    }
  }
  return FleetLaneOutcome(
    failed: failed,
    retried: retried,
    partial:
        !_coversToday(snapshot, FleetLaneState.failed, dayStart) ||
        !_coversToday(snapshot, FleetLaneState.idle, dayStart),
  );
}

/// The publisher's lane cap (`MAX_LANES` in
/// scripts/mastermind-fleet/fleet-state.mjs; a peer listing stops there too).
const _laneCap = 300;

/// Whether the snapshot lists every lane in [state] updated since
/// [dayStart]. The publisher keeps each state's newest lanes under its cap,
/// so the listed ones cover today when all of them are listed or the oldest
/// listed one predates the day. A full snapshot with none in [state] may have
/// cut them before they were counted: a peer with as many active lanes as
/// the cap lists no failed or idle ones at all.
bool _coversToday(
  FleetSnapshot snapshot,
  FleetLaneState state,
  DateTime dayStart,
) {
  final total = switch (state) {
    FleetLaneState.failed => snapshot.counts.failed,
    FleetLaneState.idle => snapshot.counts.idle,
    _ => 0,
  };
  final listed = snapshot.lanes.where((lane) => lane.state == state);
  if (listed.isEmpty && snapshot.lanes.length >= _laneCap) return false;
  if (listed.length >= total) return true;
  return listed.any((lane) => lane.updatedAt.isBefore(dayStart));
}

/// Today: per-machine outcomes. Classified where the publisher can read the
/// failure records, lane counts with the reason where it cannot.
class FleetTodayOutcomesPanel extends StatelessWidget {
  const FleetTodayOutcomesPanel({
    required this.snapshot,
    required this.now,
    super.key,
  });

  final FleetSnapshot snapshot;
  final DateTime now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppPanel(
      title: l10n.mastermindFleetOutcomesTitle,
      padded: false,
      child: Column(
        children: [
          for (final machine in snapshot.machines)
            _row(l10n, machine, fleetMachineOutcome(snapshot, machine, now)),
        ],
      ),
    );
  }

  Widget _row(
    AppLocalizations l10n,
    FleetMachine machine,
    FleetMachineOutcome outcome,
  ) {
    final stale = switch (outcome) {
      FleetClassifiedOutcome(:final outcomes) =>
        now.difference(outcomes.observedAt) > fleetStaleAfter,
      FleetLaneOutcome() =>
        fleetMachineStatusAt(machine, now) == FleetMachineStatus.stale,
      FleetNoOutcome() => false,
    };
    return AppRichRow(
      title: machine.label,
      subtitle: _summary(l10n, outcome),
      trailing: stale
          ? AppBadge(
              variant: AppBadgeVariant.warning,
              child: Text(l10n.mastermindUsageStale),
            )
          : null,
    );
  }

  String _summary(AppLocalizations l10n, FleetMachineOutcome outcome) {
    switch (outcome) {
      case FleetClassifiedOutcome(:final outcomes):
        final summary = l10n.mastermindFleetOutcomesSummary(
          outcomes.real,
          outcomes.quotaRecovered,
          outcomes.quotaUnrecovered,
          outcomes.unclassified,
        );
        return outcomes.partial
            ? '$summary · ${l10n.mastermindFleetOutcomesPartial}'
            : summary;
      case FleetLaneOutcome(:final failed, :final retried, :final partial):
        final lanes = l10n.mastermindFleetOutcomesLanes(failed, retried);
        return partial
            ? '$lanes · ${l10n.mastermindFleetOutcomesPartial}'
            : lanes;
      case FleetNoOutcome(offline: true):
        return l10n.mastermindFleetOutcomesOffline;
      case FleetNoOutcome():
        return l10n.mastermindUsageMissing;
    }
  }
}
