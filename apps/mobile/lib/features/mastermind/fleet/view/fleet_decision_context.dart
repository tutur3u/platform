import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_clock.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_format.dart';
import 'package:mobile/l10n/l10n.dart';

/// Age and the deadline countdown, re-rendered every second. A passed
/// deadline turns destructive.
class FleetDecisionMeta extends StatelessWidget {
  const FleetDecisionMeta({required this.decision, this.now, super.key});

  final FleetDecision decision;
  final DateTime Function()? now;

  @override
  Widget build(BuildContext context) => FleetClock(
    now: now,
    builder: (context, current) {
      final l10n = context.l10n;
      final deadline = decision.deadlineAt;
      final left = deadline?.difference(current);
      return Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.xs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          AppMetaItem(
            icon: LucideIcons.clock,
            label: fleetAge(l10n, decision.createdAt, current),
          ),
          if (left != null)
            AppMetaItem(
              icon: LucideIcons.timer,
              label: left > Duration.zero
                  ? l10n.mastermindFleetDueIn(fleetCountdown(l10n, left))
                  : l10n.mastermindFleetPastDeadline,
              color: left > Duration.zero
                  ? null
                  : AppTokens.of(context).colorScheme.destructive,
            ),
        ],
      );
    },
  );
}

/// Why it was asked, what happens without an answer, and who asks. Rows
/// without a value are left out; [showRequester] false leaves out who asks
/// for a card that names it in its header.
class FleetDecisionContext extends StatelessWidget {
  const FleetDecisionContext({
    required this.decision,
    this.showRequester = true,
    super.key,
  });

  final FleetDecision decision;
  final bool showRequester;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final rows = [
      if (decision.why case final why?) (l10n.mastermindFleetWhy, why),
      if (decision.defaultOutcome case final outcome?)
        (l10n.mastermindFleetIfNoAnswer, outcome),
      if (decision.requester case final from? when showRequester)
        (l10n.mastermindFleetFrom, from),
    ];
    if (rows.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Column(
        children: [for (final (label, value) in rows) _Row(label, value)],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.label, this.value);

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return MergeSemantics(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 104,
              child: Text(
                label,
                style: tokens.typography.small.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
            ),
            Expanded(child: Text(value, style: tokens.typography.small)),
          ],
        ),
      ),
    );
  }
}
