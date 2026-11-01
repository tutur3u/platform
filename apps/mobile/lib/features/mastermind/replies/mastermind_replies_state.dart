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

/// A one-tap option reply inside its undo window: chosen, not yet queued.
final class PendingOptionReply {
  const PendingOptionReply({
    required this.versionHash,
    required this.optionIndex,
    required this.option,
    this.committed = false,
  });

  final String versionHash;
  final int optionIndex;
  final String option;

  /// The window ended: the reply is being queued and sent, so Undo is gone.
  final bool committed;

  PendingOptionReply get asCommitted => PendingOptionReply(
    versionHash: versionHash,
    optionIndex: optionIndex,
    option: option,
    committed: true,
  );
}

final class MastermindRepliesState {
  const MastermindRepliesState({
    this.capability = ReplyCapability.unknown,
    this.outbox = const [],
    this.statuses = const {},
    this.pendingOptions = const {},
    this.loaded = false,
  });

  final ReplyCapability capability;
  final List<OutboxEntry> outbox;
  final Map<String, ReplyItemStatus> statuses;

  /// Option taps still in their undo window, by item id.
  final Map<String, PendingOptionReply> pendingOptions;

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

  /// The option reply for [itemId] at [versionHash] in its undo window, if any.
  PendingOptionReply? pendingOptionFor(String itemId, String versionHash) {
    final pending = pendingOptions[itemId];
    return pending?.versionHash == versionHash ? pending : null;
  }

  /// Option replies still undoable (window not yet ended).
  List<PendingOptionReply> get heldReplies => [
    for (final pending in pendingOptions.values)
      if (!pending.committed) pending,
  ];

  /// When the first still-undoable reply stops being undoable, or null.
  DateTime? get earliestHoldUntil {
    DateTime? earliest;
    for (final entry in outbox) {
      final until = entry.holdUntil;
      final pending = pendingOptions[entry.itemId];
      if (until == null ||
          entry.status != OutboxStatus.pending ||
          pending == null ||
          pending.committed ||
          pending.versionHash != entry.versionHash) {
        continue;
      }
      if (earliest == null || until.isBefore(earliest)) earliest = until;
    }
    return earliest;
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
    Map<String, PendingOptionReply>? pendingOptions,
    bool? loaded,
  }) => MastermindRepliesState(
    capability: capability ?? this.capability,
    outbox: outbox ?? this.outbox,
    statuses: statuses ?? this.statuses,
    pendingOptions: pendingOptions ?? this.pendingOptions,
    loaded: loaded ?? this.loaded,
  );
}
