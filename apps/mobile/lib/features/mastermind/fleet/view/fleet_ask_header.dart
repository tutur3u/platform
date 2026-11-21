import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/l10n/l10n.dart';

/// The top row of an ask or review card: its urgency, who asks, and the
/// deadline countdown re-rendered every second. A passed deadline turns
/// destructive. [badge] adds a kind label such as "Design review".
class FleetAskHeader extends StatelessWidget {
  const FleetAskHeader({
    required this.decision,
    this.badge,
    this.now,
    super.key,
  });

  final FleetDecision decision;
  final String? badge;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final urgency = switch (decision.urgency) {
      FleetUrgency.urgent => (
        l10n.mastermindFleetTierUrgent,
        AppBadgeVariant.destructive,
      ),
      FleetUrgency.high => (
        l10n.mastermindFleetUrgencyHigh,
        AppBadgeVariant.warning,
      ),
      FleetUrgency.normal => (
        l10n.mastermindFleetUrgencyNormal,
        AppBadgeVariant.secondary,
      ),
      FleetUrgency.fyi => null,
    };
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.xs,
      crossAxisAlignment: WrapCrossAlignment.center,
      children: [
        if (urgency case (final label, final variant))
          AppBadge(variant: variant, child: Text(label)),
        if (badge case final badge?) AppBadge.outline(child: Text(badge)),
        if (decision.requester case final from?)
          Text(
            from,
            style: tokens.typography.small.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
        if (decision.deadlineAt case final deadline?)
          FleetClock(
            now: now,
            builder: (context, current) {
              final left = deadline.difference(current);
              return AppMetaItem(
                icon: LucideIcons.clock,
                label: left > Duration.zero
                    ? l10n.mastermindFleetDueIn(fleetCountdown(l10n, left))
                    : l10n.mastermindFleetPastDeadline,
                color: left > Duration.zero
                    ? null
                    : tokens.colorScheme.destructive,
              );
            },
          ),
      ],
    );
  }
}
