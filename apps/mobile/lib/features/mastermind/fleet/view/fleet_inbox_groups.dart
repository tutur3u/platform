import 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';

/// The Inbox at a moment: open decisions split into urgent, access requests,
/// needs a decision and FYI, then the ones snoozed on this device, then the
/// answered ones, then this device's answers that never reached a decision
/// before it closed. Only the snapshot's open decisions form the open tiers:
/// an answer still pending here cannot keep a closed decision there. Login
/// requests form their own tier whatever their urgency: they block work
/// until the owner signs in. A login request that has
/// ended stays visible with its state but cannot be snoozed. A decision
/// with an answer still in flight here keeps its place even when a poll
/// brings another device's receipt, so Undo and Retry stay where the owner
/// tapped.
class FleetInboxGroups {
  FleetInboxGroups(
    FleetSnapshot snapshot,
    Map<String, DateTime> snoozes,
    DateTime now, {
    Map<String, FleetPendingAnswer> pending = const {},
  }) {
    final inFlight = {
      for (final MapEntry(:key, :value) in pending.entries)
        if (value.status != FleetSendStatus.closed) key,
    };
    final open =
        [
          ...snapshot.openDecisions,
          ...snapshot.decisions.where(
            (d) =>
                inFlight.contains(d.id) && snapshot.answers.containsKey(d.id),
          ),
        ]..sort(
          (a, b) => a.urgency.index != b.urgency.index
              ? a.urgency.index - b.urgency.index
              : a.createdAt.compareTo(b.createdAt),
        );
    for (final decision in open) {
      final until = snoozes[decision.id];
      final actionable = decision.login?.isOpenAt(now) ?? true;
      if (actionable && until != null && until.isAfter(now)) {
        snoozed.add((decision, until));
        continue;
      }
      if (actionable) openCount++;
      if (decision.kind == FleetDecisionKind.login) {
        access.add(decision);
      } else {
        switch (decision.urgency) {
          case FleetUrgency.urgent:
            urgent.add(decision);
          case FleetUrgency.high || FleetUrgency.normal:
            decide.add(decision);
          case FleetUrgency.fyi:
            fyi.add(decision);
        }
      }
    }
    snoozed.sort((a, b) => a.$2.compareTo(b.$2));
    answered.addAll(
      snapshot.decisions.where(
        (d) => snapshot.answers.containsKey(d.id) && !inFlight.contains(d.id),
      ),
    );
    final live = {for (final d in snapshot.decisions) d.id};
    resolved.addAll(snapshot.resolved.where((r) => !live.contains(r.id)));
    undelivered.addAll(
      [
        for (final MapEntry(:key, :value) in pending.entries)
          if (!value.outstanding && !live.contains(key)) (key, value),
      ]..sort((a, b) => b.$2.createdAt.compareTo(a.$2.createdAt)),
    );
  }

  final urgent = <FleetDecision>[];
  final access = <FleetDecision>[];
  final decide = <FleetDecision>[];
  final fyi = <FleetDecision>[];
  final snoozed = <(FleetDecision, DateTime)>[];
  final answered = <FleetDecision>[];
  final resolved = <FleetResolvedDecision>[];

  /// Closed or refused answers whose decision has left the snapshot.
  final undelivered = <(String, FleetPendingAnswer)>[];

  /// Cards the owner can still act on; an ended login request shows its
  /// state in Access requests but does not count.
  int openCount = 0;
}
