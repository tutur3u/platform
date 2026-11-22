import 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_history_entry.dart';

export 'package:mobile/features/mastermind/fleet/view/fleet_history_entry.dart';

/// The Inbox at a moment, in three lanes.
///
/// Needs you: open asks, sign-in requests and design reviews, most urgent
/// first, then the ones snoozed on this device. An answer sent from here
/// takes its decision out at once (optimistic), and a refused or stalled
/// answer brings it back with the reason. A signed-in login request keeps
/// blocking work until it is verified, so it stays listed but uncounted.
///
/// FYI: open items that only inform. History: answered and closed
/// decisions, newest first, including answers still on their way.
///
/// The tab counts cover only what is still open: answered, resolved and
/// withdrawn decisions are in History and never counted.
class FleetInboxGroups {
  FleetInboxGroups(
    FleetSnapshot snapshot,
    Map<String, DateTime> snoozes,
    DateTime now, {
    Map<String, FleetPendingAnswer> pending = const {},
    FleetDecision? Function(String decisionId)? seen,
  }) {
    final secretIds = {
      for (final decision in snapshot.decisions)
        if (decision.kind == FleetDecisionKind.secret) decision.id,
      for (final decision in snapshot.resolved)
        if (decision.kind == FleetDecisionKind.secret) decision.id,
    };
    bool secret(String id) =>
        secretIds.contains(id) ||
        seen?.call(id)?.kind == FleetDecisionKind.secret;

    // A sign-in request keeps its card while its answer travels: it keeps
    // blocking work until the agent verifies it.
    bool away(FleetDecision d) =>
        d.kind != FleetDecisionKind.login && (pending[d.id]?.inFlight ?? false);
    bool returned(FleetDecision d) => pending[d.id]?.needsOwner ?? false;
    bool answered(FleetDecision d) => snapshot.answers.containsKey(d.id);
    bool blocking(FleetDecision d) => d.login?.isOpenAt(now) ?? false;
    final open =
        [
          for (final d in snapshot.decisions)
            if (!secret(d.id) &&
                !away(d) &&
                (!answered(d) || returned(d) || blocking(d)))
              d,
        ]..sort(
          (a, b) => a.urgency.index != b.urgency.index
              ? a.urgency.index - b.urgency.index
              : a.createdAt.compareTo(b.createdAt),
        );
    for (final decision in open) {
      final actionable = decision.login?.isOpenAt(now) ?? true;
      final settled = answered(decision) && !returned(decision);
      final until = snoozes[decision.id];
      if (actionable &&
          !returned(decision) &&
          until != null &&
          until.isAfter(now)) {
        snoozed.add((decision, until));
        continue;
      }
      // Sign-ins, design reviews and answers that came back undelivered
      // always need the owner, whatever their urgency.
      if (decision.urgency == FleetUrgency.fyi &&
          decision.kind == FleetDecisionKind.ask &&
          !returned(decision)) {
        fyi.add(decision);
        continue;
      }
      if (actionable && !settled) openCount++;
      needs.add(decision);
    }
    snoozed.sort((a, b) => a.$2.compareTo(b.$2));
    history.addAll(
      fleetHistory(
        snapshot,
        pending,
        now,
        seen: seen,
      ).where((e) => !secret(e.id)),
    );
    final live = {for (final d in snapshot.decisions) d.id};
    undelivered.addAll(
      [
        for (final MapEntry(:key, :value) in pending.entries)
          if (!value.outstanding && !live.contains(key) && !secret(key))
            (key, value),
      ]..sort((a, b) => b.$2.createdAt.compareTo(a.$2.createdAt)),
    );
    alertCount = snapshot.alerts.length;
  }

  /// Asks, sign-in requests and reviews, most urgent first.
  final needs = <FleetDecision>[];

  /// Open items that only inform.
  final fyi = <FleetDecision>[];
  final snoozed = <(FleetDecision, DateTime)>[];

  /// Answered and closed decisions, newest first.
  final history = <FleetHistoryEntry>[];

  /// Answers from this device whose decision closed before they arrived.
  final undelivered = <(String, FleetPendingAnswer)>[];

  /// Cards the owner can still act on.
  int openCount = 0;

  /// Firing SLO burn alerts, shown and counted in FYI.
  int alertCount = 0;

  /// The FYI badge: open FYI items and firing alerts, nothing settled.
  int get fyiCount => fyi.length + alertCount;

  /// The order detail pages step through: Needs you, then FYI.
  List<String> get order => [
    for (final d in [...needs, ...fyi]) d.id,
  ];
}
