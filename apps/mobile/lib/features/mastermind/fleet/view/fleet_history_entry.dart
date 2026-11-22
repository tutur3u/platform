import 'package:mobile/features/mastermind/fleet/cubit/fleet_pending_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';

/// Where an answered or closed decision stands, for History.
enum FleetHistoryStatus {
  /// This device's answer is inside its undo window or on the wire.
  sending,

  /// This device's answer failed once and retries on its own.
  retrying,

  /// Web recorded the answer; the orchestrator has not picked it up yet.
  waiting,

  /// The orchestrator picked the answer up.
  received,

  /// Closed on any channel with an answer, so the orchestrator has it.
  delivered,

  /// Closed by the orchestrator without an answer.
  withdrawn,

  /// Settled outside the Inbox, for example fixed and reported directly.
  resolved,
}

/// One History row: a decision the owner answered or that closed, newest
/// first. [decision] is set while the snapshot (or this session) still knows
/// the full decision, so its detail can open read-only.
class FleetHistoryEntry {
  const FleetHistoryEntry({
    required this.id,
    required this.title,
    required this.at,
    required this.status,
    this.kind = FleetDecisionKind.ask,
    this.decision,
    this.outcome,
    this.action,
    this.channel,
    this.pending,
  });

  final String id;
  final String title;
  final DateTime at;
  final FleetHistoryStatus status;
  final FleetDecisionKind kind;
  final FleetDecision? decision;

  /// The chosen option's label or a closed decision's recorded outcome.
  final String? outcome;

  /// What this device sent, when the answer came from here.
  final FleetAnswerAction? action;
  final FleetAnswerChannel? channel;
  final FleetPendingAnswer? pending;

  bool get undoable => pending?.status == FleetSendStatus.queued;
}

String? _optionLabel(FleetDecision? decision, String? optionId) =>
    decision?.options.where((o) => o.id == optionId).firstOrNull?.label;

/// Builds History from the snapshot and this device's answers. Each decision
/// appears once: an answer still travelling from here wins over Web's
/// receipt, and a receipt wins over resolved history.
List<FleetHistoryEntry> fleetHistory(
  FleetSnapshot snapshot,
  Map<String, FleetPendingAnswer> pending,
  DateTime now, {
  FleetDecision? Function(String decisionId)? seen,
}) {
  final live = {for (final d in snapshot.decisions) d.id: d};
  final entries = <String, FleetHistoryEntry>{};
  for (final MapEntry(:key, :value) in pending.entries) {
    if (!value.inFlight) continue;
    final decision = live[key] ?? seen?.call(key);
    // Sign-in answers stay on the request's own card until it is verified.
    if (decision?.kind == FleetDecisionKind.login) continue;
    entries[key] = FleetHistoryEntry(
      id: key,
      title: decision?.title ?? value.title ?? key,
      at: value.createdAt,
      status: value.status == FleetSendStatus.retrying
          ? FleetHistoryStatus.retrying
          : FleetHistoryStatus.sending,
      kind: decision?.kind ?? FleetDecisionKind.ask,
      decision: decision,
      outcome: _optionLabel(decision, value.optionId),
      action: value.action,
      channel: FleetAnswerChannel.mastermind,
      pending: value,
    );
  }
  for (final MapEntry(:key, :value) in snapshot.answers.entries) {
    final decision = live[key];
    if (decision == null || entries.containsKey(key)) continue;
    // A refused or stalled answer is back in Needs you, not settled.
    if (pending[key]?.needsOwner ?? false) continue;
    // A signed-in login request keeps blocking work until it is verified.
    if (decision.login?.isOpenAt(now) ?? false) continue;
    entries[key] = FleetHistoryEntry(
      id: key,
      title: decision.title,
      at: value.answeredAt,
      status: value.pickedUp
          ? FleetHistoryStatus.received
          : FleetHistoryStatus.waiting,
      kind: decision.kind,
      decision: decision,
      outcome: _optionLabel(decision, value.optionId),
      action: value.action,
      channel: FleetAnswerChannel.mastermind,
    );
  }
  for (final resolved in snapshot.resolved) {
    if (live.containsKey(resolved.id) || entries.containsKey(resolved.id)) {
      continue;
    }
    final status = switch (resolved.outcome) {
      'Withdrawn' => FleetHistoryStatus.withdrawn,
      'Resolved' => FleetHistoryStatus.resolved,
      _ => FleetHistoryStatus.delivered,
    };
    entries[resolved.id] = FleetHistoryEntry(
      id: resolved.id,
      title: resolved.title,
      at: resolved.resolvedAt,
      status: status,
      kind: resolved.kind,
      decision: seen?.call(resolved.id),
      outcome: status == FleetHistoryStatus.delivered ? resolved.outcome : null,
      channel: resolved.answeredVia,
    );
  }
  return entries.values.toList()..sort((a, b) => b.at.compareTo(a.at));
}
