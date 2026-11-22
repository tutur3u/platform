import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_secret_state.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';
import 'package:mobile/l10n/l10n.dart';

String fleetSecretBlockText(AppLocalizations l10n, FleetSecretBlock block) =>
    switch (block) {
      FleetSecretBlock.unsupported => l10n.mastermindSecretBlockUnsupported,
      FleetSecretBlock.signedOut => l10n.mastermindSecretBlockSignedOut,
      FleetSecretBlock.idMismatch => l10n.mastermindSecretBlockIdMismatch,
      FleetSecretBlock.pendingPin => l10n.mastermindSecretBlockPendingPin,
      FleetSecretBlock.keyChanged => l10n.mastermindSecretBlockKeyChanged,
      FleetSecretBlock.badSignature => l10n.mastermindSecretBlockBadSignature,
      FleetSecretBlock.notInAudience => l10n.mastermindSecretBlockNotInAudience,
      FleetSecretBlock.quoting => l10n.mastermindSecretBlockQuoting,
      FleetSecretBlock.expiring => l10n.mastermindSecretBlockExpiring,
      FleetSecretBlock.locked => l10n.mastermindSecretBlockLocked,
      FleetSecretBlock.notDelivered => l10n.mastermindSecretBlockNotDelivered,
      FleetSecretBlock.forbidden => l10n.mastermindSecretBlockForbidden,
      FleetSecretBlock.failed => l10n.mastermindSecretBlockFailed,
    };

String _outcomeText(AppLocalizations l10n, FleetSecretOutcomeKind outcome) =>
    switch (outcome) {
      FleetSecretOutcomeKind.delivered => l10n.mastermindSecretOutcomeDelivered,
      FleetSecretOutcomeKind.failed => l10n.mastermindSecretOutcomeFailed,
      FleetSecretOutcomeKind.declined => l10n.mastermindSecretOutcomeDeclined,
      FleetSecretOutcomeKind.expired => l10n.mastermindSecretOutcomeExpired,
      FleetSecretOutcomeKind.cancelled => l10n.mastermindSecretOutcomeCancelled,
      FleetSecretOutcomeKind.paired => l10n.mastermindSecretOutcomePaired,
    };

/// What happened, for every phase that shows no input: why it is blocked,
/// that it closed, how far the answer got, and the machine-signed outcome
/// as checked on this phone. Null for the phases that take input.
class FleetSecretStatus extends StatelessWidget {
  const FleetSecretStatus({
    required this.state,
    required this.pairing,
    super.key,
  });

  final FleetSecretState state;
  final bool pairing;

  static bool shows(FleetSecretPhase phase) => switch (phase) {
    FleetSecretPhase.blocked ||
    FleetSecretPhase.needsPairing ||
    FleetSecretPhase.sent ||
    FleetSecretPhase.pickedUp ||
    FleetSecretPhase.outcome ||
    FleetSecretPhase.closed => true,
    _ => false,
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final (icon, tone, title) = switch (state.phase) {
      FleetSecretPhase.blocked => (
        LucideIcons.shieldAlert,
        AppTone.destructive,
        fleetSecretBlockText(l10n, state.block ?? FleetSecretBlock.failed),
      ),
      FleetSecretPhase.needsPairing => (
        LucideIcons.link,
        AppTone.warning,
        l10n.mastermindSecretNeedsPairing,
      ),
      FleetSecretPhase.sent => (
        LucideIcons.send,
        AppTone.info,
        pairing ? l10n.mastermindSecretPairSent : l10n.mastermindSecretSent,
      ),
      FleetSecretPhase.pickedUp => (
        LucideIcons.inbox,
        AppTone.info,
        l10n.mastermindSecretPickedUp,
      ),
      FleetSecretPhase.outcome => _settled(l10n, state.settled),
      _ => (
        LucideIcons.circleSlash,
        AppTone.neutral,
        l10n.mastermindSecretClosed,
      ),
    };
    return AppStateMessage.inline(
      key: ValueKey('fleet-secret-status-${state.phase.name}'),
      icon: icon,
      tone: tone,
      title: title,
    );
  }

  (IconData, AppTone, String) _settled(
    AppLocalizations l10n,
    FleetSecretSettled? settled,
  ) {
    if (settled == null || !settled.verified) {
      return (
        LucideIcons.shieldAlert,
        AppTone.destructive,
        l10n.mastermindSecretOutcomeUnverified,
      );
    }
    if (!settled.mine) {
      return (
        LucideIcons.circleSlash,
        AppTone.neutral,
        l10n.mastermindSecretOutcomeNotMine,
      );
    }
    final good =
        settled.outcome == FleetSecretOutcomeKind.delivered ||
        settled.outcome == FleetSecretOutcomeKind.paired;
    return (
      good ? LucideIcons.circleCheck : LucideIcons.circleSlash,
      good ? AppTone.success : AppTone.neutral,
      _outcomeText(l10n, settled.outcome),
    );
  }
}
