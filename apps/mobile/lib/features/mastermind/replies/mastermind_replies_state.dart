import 'package:mobile/features/mastermind/replies/reply_models.dart';

/// Whether the hub currently accepts replies, from GET /v1/capabilities.
enum ReplyCapability {
  /// Not asked yet this session (or after a logout).
  unknown,
  checking,
  supported,

  /// The hub says no (replies off, or no schema 1.4): hide the composer.
  unsupported,

  /// The question could not be asked (offline, Worker down).
  unavailable,
}

/// Why the last attempt for an item did not end in an accepted reply.
enum ReplyIssue {
  /// The reply is queued on the device and will go out when the hub answers.
  offline,

  /// 409 `stale_item`: the question changed or was answered.
  stale,

  /// 409 `idempotency_conflict`: the key was already used for another body.
  conflict,

  /// 400: the hub refused the request.
  rejected,

  /// 400 `unsafe_text`: the text policy refused the note.
  unsafeText,

  /// 413: the request was too large.
  tooLarge,

  /// 429: wait [ReplyItemStatus.retryAt].
  rateLimited,

  /// 401: the session no longer authorizes the hub. Retry, then sign in again.
  unauthorized,

  /// 403 `forbidden`: this account may not reply.
  forbidden,

  /// The reply could not be saved on the device, so nothing was sent.
  notSaved,
}

/// The transient status of one item's reply attempts.
final class ReplyItemStatus {
  const ReplyItemStatus({
    this.sending = false,
    this.issue,
    this.retryAt,
    this.authFailures = 0,
  });

  static const idle = ReplyItemStatus();

  final bool sending;
  final ReplyIssue? issue;

  /// Earliest time to try again after a 429.
  final DateTime? retryAt;

  /// Consecutive 401s. The first asks for a retry; later ones offer sign-in.
  final int authFailures;
}

final class MastermindRepliesState {
  const MastermindRepliesState({
    this.capability = ReplyCapability.unknown,
    this.outbox = const [],
    this.statuses = const {},
    this.loaded = false,
  });

  final ReplyCapability capability;
  final List<OutboxEntry> outbox;
  final Map<String, ReplyItemStatus> statuses;

  /// The persisted outbox has been read for this user.
  final bool loaded;

  bool get canReply => capability == ReplyCapability.supported;

  /// A reply is bound to the exact version of the question it answered, so a
  /// queued reply to an older version of the item is never mistaken for this
  /// one.
  OutboxEntry? entryFor(String itemId, String versionHash) {
    for (final entry in outbox) {
      if (entry.itemId == itemId && entry.versionHash == versionHash) {
        return entry;
      }
    }
    return null;
  }

  ReplyItemStatus statusFor(String itemId) =>
      statuses[itemId] ?? ReplyItemStatus.idle;

  /// Replies on the device the hub has not accepted yet.
  int get pendingCount =>
      outbox.where((entry) => entry.status == OutboxStatus.pending).length;

  MastermindRepliesState copyWith({
    ReplyCapability? capability,
    List<OutboxEntry>? outbox,
    Map<String, ReplyItemStatus>? statuses,
    bool? loaded,
  }) => MastermindRepliesState(
    capability: capability ?? this.capability,
    outbox: outbox ?? this.outbox,
    statuses: statuses ?? this.statuses,
    loaded: loaded ?? this.loaded,
  );
}
