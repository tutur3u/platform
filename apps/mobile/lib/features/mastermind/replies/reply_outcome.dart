import 'package:mobile/features/mastermind/replies/reply_models.dart';

/// How the hub answered one POST /v1/replies, reduced to what the app acts on.
/// Never carries a body, a header or a server message.
sealed class ReplyOutcome {
  const ReplyOutcome();
}

/// 201 created, or 200 for a replay of the same key and body. Identical to the
/// app: the reply is in.
final class ReplyAccepted extends ReplyOutcome {
  const ReplyAccepted({this.replayed = false});
  final bool replayed;
}

/// 409 `stale_item`: the item is gone, answered, or its `version_hash` moved.
final class ReplyStale extends ReplyOutcome {
  const ReplyStale();
}

/// 409 `idempotency_conflict`: this key already carries a different body.
final class ReplyKeyConflict extends ReplyOutcome {
  const ReplyKeyConflict();
}

/// 400: the Worker refused the request. `unsafe_text` is the text policy.
final class ReplyRejected extends ReplyOutcome {
  const ReplyRejected({this.unsafeText = false});
  final bool unsafeText;
}

/// 413: unreachable while the composer enforces its limits.
final class ReplyTooLarge extends ReplyOutcome {
  const ReplyTooLarge();
}

/// 401 after one silent session refresh.
final class ReplyUnauthorized extends ReplyOutcome {
  const ReplyUnauthorized();
}

/// 403: `replies_disabled` (the Worker switch is off) or `forbidden` (this
/// account is not an allowed owner).
final class ReplyForbidden extends ReplyOutcome {
  const ReplyForbidden({required this.disabled});
  final bool disabled;
}

/// 429, with the server's `Retry-After` when it sent a usable one.
final class ReplyRateLimited extends ReplyOutcome {
  const ReplyRateLimited({this.retryAfter});
  final Duration? retryAfter;
}

/// Network failure, timeout or 5xx: the outcome is unknown, so the same key is
/// sent again later.
final class ReplyUnavailable extends ReplyOutcome {
  const ReplyUnavailable();
}

abstract interface class MastermindReplyTransport {
  Future<ReplyOutcome> send(OutboxEntry entry);
}
