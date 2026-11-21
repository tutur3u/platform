import 'package:flutter/widgets.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/l10n/l10n.dart';

/// How long ago [time] was, relative to [now], in short words.
String fleetAge(AppLocalizations l10n, DateTime time, DateTime now) {
  final age = now.difference(time);
  if (age.inMinutes < 1) return l10n.mastermindFleetAgeNow;
  if (age.inHours < 1) return l10n.mastermindFleetAgeMinutes(age.inMinutes);
  if (age.inDays < 1) return l10n.mastermindFleetAgeHours(age.inHours);
  return l10n.mastermindFleetAgeDays(age.inDays);
}

extension FleetLaneStateView on FleetLaneState {
  String label(AppLocalizations l10n) => switch (this) {
    FleetLaneState.running => l10n.mastermindFleetStateRunning,
    FleetLaneState.waiting => l10n.mastermindFleetStateWaiting,
    FleetLaneState.queued => l10n.mastermindFleetStateQueued,
    FleetLaneState.idle => l10n.mastermindFleetStateIdle,
    FleetLaneState.failed => l10n.mastermindFleetStateFailed,
  };

  AppTone get tone => switch (this) {
    FleetLaneState.running => AppTone.success,
    FleetLaneState.waiting => AppTone.warning,
    FleetLaneState.queued => AppTone.info,
    FleetLaneState.idle => AppTone.neutral,
    FleetLaneState.failed => AppTone.destructive,
  };

  IconData get icon => switch (this) {
    FleetLaneState.running => LucideIcons.play,
    FleetLaneState.waiting => LucideIcons.hourglass,
    FleetLaneState.queued => LucideIcons.listOrdered,
    FleetLaneState.idle => LucideIcons.moon,
    FleetLaneState.failed => LucideIcons.circleAlert,
  };
}

extension FleetMachineStatusView on FleetMachineStatus {
  String label(AppLocalizations l10n) => switch (this) {
    FleetMachineStatus.online => l10n.mastermindFleetMachineOnline,
    FleetMachineStatus.stale => l10n.mastermindFleetMachineStale,
    FleetMachineStatus.offline => l10n.mastermindFleetMachineOffline,
  };

  AppTone get tone => switch (this) {
    FleetMachineStatus.online => AppTone.success,
    FleetMachineStatus.stale => AppTone.warning,
    FleetMachineStatus.offline => AppTone.neutral,
  };
}

extension FleetOrchestratorStateView on FleetOrchestratorState {
  String label(AppLocalizations l10n) => switch (this) {
    FleetOrchestratorState.running => l10n.mastermindFleetOrchestratorWorking,
    FleetOrchestratorState.waiting => l10n.mastermindFleetOrchestratorWaiting,
    FleetOrchestratorState.idle => l10n.mastermindFleetOrchestratorIdle,
    FleetOrchestratorState.offline => l10n.mastermindFleetOrchestratorOffline,
  };
}

extension FleetAnswerActionView on FleetAnswerAction {
  String doneLabel(AppLocalizations l10n) => switch (this) {
    FleetAnswerAction.approve => l10n.mastermindFleetAnswerApproved,
    FleetAnswerAction.hold => l10n.mastermindFleetAnswerHeld,
    FleetAnswerAction.reply => l10n.mastermindFleetAnswerReplied,
    FleetAnswerAction.signedIn => l10n.mastermindFleetAnswerSignedIn,
  };
}

/// Lanes that count as active work on a machine.
bool fleetLaneIsActive(FleetLane lane) =>
    lane.state == FleetLaneState.running ||
    lane.state == FleetLaneState.waiting ||
    lane.state == FleetLaneState.queued;

/// Data older than this means the publisher stopped, not just a quiet fleet.
const fleetStaleAfter = Duration(minutes: 5);
