import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_binding.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/l10n/l10n.dart';

/// The Inbox card of a `secret` decision: clearly labelled as an encrypted
/// secret request or machine pairing, with the purpose (or machine to pair),
/// machine name, live countdown, and one entry point into [onOpen].
///
/// Matches the compact Inbox card layout while staying visually distinct and
/// never rendering ordinary decision controls (Approve, Hold, Reply, Snooze).
/// Nothing here is verified yet; the full-screen page verifies before it
/// shows any input.
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
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final muted = colors.mutedForeground;
    final caption = tokens.typography.caption.copyWith(color: muted);
    final secret = decision.secret!;
    final pairing = secret is FleetSecretPairing;
    final subject = switch (secret) {
      FleetSecretRequest(:final purpose) => purpose,
      FleetSecretPairing(:final machineLabel) => machineLabel,
    };
    final visibleSubject = FleetSecretBinding.visible(subject);
    final kind = kindLabel(l10n, decision);
    final machine = machineLabel ?? secret.machineId;
    return AppCard(
      key: ValueKey('fleet-secret-card-${decision.id}'),
      onTap: onOpen,
      semanticLabel: '$kind: $visibleSubject',
      fillColor: Color.alphaBlend(
        colors.warning.withValues(alpha: colors.isDark ? 0.10 : 0.05),
        colors.card,
      ),
      borderColor: colors.warning.withValues(
        alpha: colors.isDark ? 0.45 : 0.35,
      ),
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.md,
        AppSpacing.lg,
        AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Wrap(
                  spacing: AppSpacing.xs,
                  runSpacing: AppSpacing.xs,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    AppBadge(
                      variant: AppBadgeVariant.warning,
                      leading: Icon(
                        pairing ? LucideIcons.link : LucideIcons.lock,
                      ),
                      child: Text(kind),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Flexible(
                child: FleetClock(
                  now: now,
                  builder: (context, current) {
                    final left = secret.expiresAtTime.difference(current);
                    final clamped = left.isNegative ? Duration.zero : left;
                    final urgent = clamped <= const Duration(minutes: 1);
                    return Text(
                      l10n.mastermindFleetExpiresIn(
                        fleetCountdown(l10n, clamped),
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.end,
                      style: urgent
                          ? caption.copyWith(color: colors.destructive)
                          : caption,
                    );
                  },
                ),
              ),
              const SizedBox(width: AppSpacing.xs),
              Icon(LucideIcons.chevronRight, size: 16, color: muted),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            visibleSubject,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: tokens.typography.heading,
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            pairing
                ? l10n.mastermindSecretPairCardHint
                : l10n.mastermindSecretCardHint,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: tokens.typography.bodySm.copyWith(color: muted),
          ),
          const SizedBox(height: AppSpacing.sm),
          Divider(height: 1, thickness: 1, color: colors.border),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              Expanded(
                child: AppMetaItem(icon: LucideIcons.monitor, label: machine),
              ),
              const SizedBox(width: AppSpacing.sm),
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
