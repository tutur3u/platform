import 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';

/// The Inbox at a moment, in two lanes. Needs you: open asks, sign-in
/// requests and design reviews, most urgent first, then the ones snoozed on
/// this device. FYI: open FYI-urgency items, this device's answers that
/// never reached a decision before it closed, answered decisions and
/// decisions closed on any channel. Only the snapshot's open decisions form
/// Needs you: an answer still pending here cannot keep a closed decision
/// there. A login request that has ended stays in place with its state but
/// cannot be snoozed or counted. A decision with an answer still in flight
/// here keeps its place even when a poll brings another device's receipt,
/// so Undo and Retry stay where the owner tapped.
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
    // A signed-in login request keeps blocking work until the agent
    // verifies it, so it stays in Needs you, uncounted.
    bool blocking(FleetDecision d) => d.login?.isOpenAt(now) ?? false;
    bool settled(FleetDecision d) =>
        snapshot.answers.containsKey(d.id) && !inFlight.contains(d.id);
    final open =
        [
          ...snapshot.openDecisions,
          ...snapshot.decisions.where(
            (d) =>
                snapshot.answers.containsKey(d.id) &&
                (inFlight.contains(d.id) || blocking(d)),
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
      // Sign-ins and design reviews always need the owner, whatever their
      // urgency.
      if (decision.urgency == FleetUrgency.fyi &&
          decision.kind == FleetDecisionKind.ask) {
        fyi.add(decision);
        continue;
      }
      if (actionable && !settled(decision)) openCount++;
      needs.add(decision);
    }
    snoozed.sort((a, b) => a.$2.compareTo(b.$2));
    answered.addAll(
      snapshot.decisions.where((d) => settled(d) && !blocking(d)),
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

  /// Asks, sign-in requests and reviews, most urgent first.
  final needs = <FleetDecision>[];

  /// Open items that only inform.
  final fyi = <FleetDecision>[];
  final snoozed = <(FleetDecision, DateTime)>[];
  final answered = <FleetDecision>[];
  final resolved = <FleetResolvedDecision>[];

  /// Closed or refused answers whose decision has left the snapshot.
  final undelivered = <(String, FleetPendingAnswer)>[];

  /// Cards the owner can still act on; an ended login request shows its
  /// state in Needs you but does not count.
  int openCount = 0;

  /// Everything in the FYI lane.
  int get fyiCount =>
      fyi.length + undelivered.length + answered.length + resolved.length;
}
