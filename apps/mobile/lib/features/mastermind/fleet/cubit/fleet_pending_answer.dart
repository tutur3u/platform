import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';

/// `queued` waits out the undo window; `sending` is on the wire; `retrying`
/// failed for a reason a resend can fix and goes again at its next attempt
/// time; `failed` was refused for good, with a reason; `closed` ended before
/// the answer reached Web.
enum FleetSendStatus { queued, sending, retrying, failed, closed }

/// One answer on its way to Web. Every attempt reuses [idempotencyKey], so a
/// retry can never record the answer twice.
class FleetPendingAnswer {
  const FleetPendingAnswer({
    required this.action,
    required this.idempotencyKey,
    required this.status,
    required this.createdAt,
    this.optionId,
    this.text,
    this.title,
    this.attempts = 0,
    this.challenges = 0,
    this.nextAttemptAt,
    this.reason,
  });

  static FleetPendingAnswer? fromJson(Map<String, dynamic> json) {
    final action = FleetAnswerAction.values
        .where((a) => a.wire == json['action'])
        .firstOrNull;
    final status = FleetSendStatus.values
        .where((s) => s.name == json['status'])
        .firstOrNull;
    final key = json['idempotencyKey'];
    final createdAt = switch (json['createdAt']) {
      final String raw => DateTime.tryParse(raw)?.toUtc(),
      _ => null,
    };
    if (action == null || status == null || key is! String) return null;
    if (createdAt == null) return null;
    String? text(String name) => switch (json[name]) {
      final String value when value.isNotEmpty => value,
      _ => null,
    };
    return FleetPendingAnswer(
      action: action,
      idempotencyKey: key,
      status: status,
      createdAt: createdAt,
      optionId: text('optionId'),
      text: text('text'),
      title: text('title'),
      attempts: switch (json['attempts']) {
        final int n when n >= 0 => n,
        _ => 0,
      },
      challenges: switch (json['challenges']) {
        final int n when n >= 0 => n,
        _ => 0,
      },
      reason: text('reason'),
    );
  }

  final FleetAnswerAction action;
  final String idempotencyKey;
  final FleetSendStatus status;

  /// When the owner answered; entries that settled long ago are pruned.
  final DateTime createdAt;
  final String? optionId;
  final String? text;

  /// The decision's title, so an answer that missed a closed decision can
  /// still say which one it was after the card is gone.
  final String? title;
  final int attempts;

  /// How many attempts met an abuse step-up; bounds those retries alone, so
  /// a long outage before a challenge does not use up its budget.
  final int challenges;
  final DateTime? nextAttemptAt;

  /// A closed-set server code such as `decision_closed` or `invalid_answer`.
  final String? reason;

  /// Still owed a send: queued, on the wire or waiting to retry.
  bool get outstanding =>
      status == FleetSendStatus.queued ||
      status == FleetSendStatus.sending ||
      status == FleetSendStatus.retrying;

  FleetPendingAnswer copyWith({
    FleetSendStatus? status,
    int? attempts,
    int? challenges,
    DateTime? nextAttemptAt,
    String? reason,
    bool clearReason = false,
  }) => FleetPendingAnswer(
    action: action,
    idempotencyKey: idempotencyKey,
    status: status ?? this.status,
    createdAt: createdAt,
    optionId: optionId,
    text: text,
    title: title,
    attempts: attempts ?? this.attempts,
    challenges: challenges ?? this.challenges,
    nextAttemptAt: status == FleetSendStatus.retrying
        ? nextAttemptAt ?? this.nextAttemptAt
        : null,
    reason: clearReason ? null : reason ?? this.reason,
  );

  FleetPendingAnswer withStatus(FleetSendStatus status) =>
      copyWith(status: status);

  /// The retry time is not kept: a restored entry goes out at once.
  Map<String, Object?> toJson() => {
    'action': action.wire,
    'idempotencyKey': idempotencyKey,
    'status': status.name,
    'createdAt': createdAt.toUtc().toIso8601String(),
    'optionId': ?optionId,
    'text': ?text,
    'title': ?title,
    'attempts': attempts,
    'challenges': challenges,
    'reason': ?reason,
  };
}

/// A 403 abuse step-up retries every [fleetChallengeRetryDelay], at most
/// this many challenged attempts (about an hour), then settles as failed:
/// it clears only once Web stops challenging this client.
const fleetChallengeRetryLimit = 30;
const fleetChallengeRetryDelay = Duration(minutes: 2);

/// 5 s, 15 s, 1 min, then every 2 min while the decision stays open.
Duration fleetRetryDelay(int attempts) => switch (attempts) {
  <= 1 => const Duration(seconds: 5),
  2 => const Duration(seconds: 15),
  3 => const Duration(minutes: 1),
  _ => const Duration(minutes: 2),
};
