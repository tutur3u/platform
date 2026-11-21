import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/l10n/l10n.dart';

extension FleetLoginStateView on FleetLoginState {
  String label(AppLocalizations l10n) => switch (this) {
    FleetLoginState.waiting => l10n.mastermindFleetLoginWaiting,
    FleetLoginState.approved => l10n.mastermindFleetLoginApproved,
    FleetLoginState.verified => l10n.mastermindFleetLoginVerified,
    FleetLoginState.expired => l10n.mastermindFleetLoginExpired,
    FleetLoginState.failed => l10n.mastermindFleetLoginFailed,
  };

  AppBadgeVariant get badge => switch (this) {
    FleetLoginState.waiting => AppBadgeVariant.warning,
    FleetLoginState.approved => AppBadgeVariant.secondary,
    FleetLoginState.verified => AppBadgeVariant.success,
    FleetLoginState.expired => AppBadgeVariant.outline,
    FleetLoginState.failed => AppBadgeVariant.destructive,
  };
}

extension FleetAnswerChannelView on FleetAnswerChannel? {
  String label(AppLocalizations l10n) => switch (this) {
    FleetAnswerChannel.mastermind => l10n.mastermindFleetAnsweredOnMastermind,
    FleetAnswerChannel.mobile => l10n.mastermindFleetAnsweredOnMobile,
    FleetAnswerChannel.whatsapp => l10n.mastermindFleetAnsweredOnWhatsapp,
    FleetAnswerChannel.cli => l10n.mastermindFleetAnsweredOnCli,
    null => l10n.mastermindFleetResolvedClosed,
  };
}

extension FleetProductionStateView on FleetProductionState {
  String label(AppLocalizations l10n) => switch (this) {
    FleetProductionState.healthy => l10n.mastermindFleetProductionHealthy,
    FleetProductionState.degraded => l10n.mastermindFleetProductionDegraded,
    FleetProductionState.down => l10n.mastermindFleetProductionDown,
    FleetProductionState.unknown => l10n.mastermindFleetProductionUnknown,
  };

  AppTone get tone => switch (this) {
    FleetProductionState.healthy => AppTone.success,
    FleetProductionState.degraded => AppTone.warning,
    FleetProductionState.down => AppTone.destructive,
    FleetProductionState.unknown => AppTone.neutral,
  };
}

extension FleetMigrationStateView on FleetMigrationState {
  String label(AppLocalizations l10n) => switch (this) {
    FleetMigrationState.idle => l10n.mastermindFleetMigrationIdle,
    FleetMigrationState.staging => l10n.mastermindFleetMigrationStaging,
    FleetMigrationState.gated => l10n.mastermindFleetMigrationGated,
    FleetMigrationState.applying => l10n.mastermindFleetMigrationApplying,
    FleetMigrationState.failed => l10n.mastermindFleetMigrationFailed,
  };
}
