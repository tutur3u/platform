import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_secret_details.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Inbox row of a `secret` decision: what kind it is, the purpose (or
/// the machine to pair), the machine, the countdown and one button that
/// opens [onOpen]. Nothing here is verified yet; the full-screen page
/// verifies before it shows any input.
class FleetSecretCard extends StatelessWidget {
  const FleetSecretCard({
    required this.decision,
    required this.onOpen,
    this.machineLabel,
    this.now,
    super.key,
  });

  final FleetDecision decision;
  final VoidCallback onOpen;

  /// The machine's label from the snapshot, when it lists the machine.
  final String? machineLabel;
  final DateTime Function()? now;

  /// "Secret request" or "Pair machine", for a host card's kind label.
  static String kindLabel(AppLocalizations l10n, FleetDecision decision) =>
      decision.secret is FleetSecretPairing
      ? l10n.mastermindSecretPairTitle
      : l10n.mastermindSecretRequestTitle;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final secret = decision.secret!;
    final pairing = secret is FleetSecretPairing;
    final subject = switch (secret) {
      FleetSecretRequest(:final purpose) => purpose,
      FleetSecretPairing(:final machineLabel) => machineLabel,
    };
    return AppCard(
      key: ValueKey('fleet-secret-card-${decision.id}'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppRichRow(
            title: kindLabel(l10n, decision),
            subtitle: FleetSecretBinding.visible(subject),
            meta: [
              AppMetaItem(
                icon: LucideIcons.monitor,
                label: machineLabel ?? secret.machineId,
              ),
            ],
            leading: AppIconTile(
              icon: pairing ? LucideIcons.link : LucideIcons.lock,
              tone: AppTone.warning,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: FleetSecretCountdown(
                  expiresAt: secret.expiresAtTime,
                  now: now,
                ),
              ),
              AppButton.primary(
                key: const ValueKey('fleet-secret-open'),
                size: AppButtonSize.small,
                leading: Icon(
                  pairing ? LucideIcons.link : LucideIcons.keyRound,
                  size: 16,
                ),
                onPressed: onOpen,
                child: Text(
                  pairing
                      ? l10n.mastermindSecretPairAction
                      : l10n.mastermindSecretProvide,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
