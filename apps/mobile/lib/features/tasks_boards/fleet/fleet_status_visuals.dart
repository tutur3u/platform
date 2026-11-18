import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/features/tasks_boards/fleet/fleet_task_meta.dart';
import 'package:mobile/l10n/l10n.dart';

/// Word, icon and tone of one fleet status. Queued and unknown statuses use
/// a quiet gray dot instead of an icon.
class FleetStatusVisual {
  const FleetStatusVisual({
    required this.label,
    required this.color,
    this.icon,
  });

  final String label;
  final Color color;

  /// Null draws a dot.
  final IconData? icon;
}

/// The status tones: needs you yellow, running blue, in review purple, CI
/// teal, blocked red, done green, queued and unknown gray.
FleetStatusVisual fleetStatusVisual(
  FleetStatus? status,
  DynamicColors palette,
  AppLocalizations l10n,
) => switch (status) {
  FleetStatus.needsUser => FleetStatusVisual(
    label: l10n.fleetStatusNeedsUser,
    color: palette.yellow,
    icon: Icons.priority_high_rounded,
  ),
  FleetStatus.running => FleetStatusVisual(
    label: l10n.fleetStatusRunning,
    color: palette.blue,
    icon: Icons.play_arrow_rounded,
  ),
  FleetStatus.waitingReview => FleetStatusVisual(
    label: l10n.fleetStatusWaitingReview,
    color: palette.purple,
    icon: Icons.rate_review_outlined,
  ),
  FleetStatus.waitingCi => FleetStatusVisual(
    label: l10n.fleetStatusWaitingCi,
    color: palette.teal,
    icon: Icons.sync_rounded,
  ),
  FleetStatus.blocked => FleetStatusVisual(
    label: l10n.fleetStatusBlocked,
    color: palette.red,
    icon: Icons.block_rounded,
  ),
  FleetStatus.done => FleetStatusVisual(
    label: l10n.fleetStatusDone,
    color: palette.green,
    icon: Icons.check_circle_outline_rounded,
  ),
  FleetStatus.queued => FleetStatusVisual(
    label: l10n.fleetStatusQueued,
    color: palette.gray,
  ),
  null => FleetStatusVisual(
    label: l10n.fleetStatusUnknown,
    color: palette.gray,
  ),
};

/// Tone of an age bucket: fresh green, aging yellow, stale red.
Color fleetStalenessColor(
  FleetStaleness staleness,
  DynamicColors palette,
  Color muted,
) => switch (staleness) {
  FleetStaleness.fresh => palette.green,
  FleetStaleness.aging => palette.yellow,
  FleetStaleness.stale => palette.red,
  FleetStaleness.unknown => muted,
};

/// Tone of an ETA bucket: overdue red, due soon yellow, else [muted].
Color fleetEtaColor(FleetEtaState state, DynamicColors palette, Color muted) =>
    switch (state) {
      FleetEtaState.overdue => palette.red,
      FleetEtaState.dueSoon => palette.yellow,
      FleetEtaState.onTrack || FleetEtaState.unknown => muted,
    };
