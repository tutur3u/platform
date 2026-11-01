/// The Iris relay contract (`/v1/iris/*`) as the phone reads it.
///
/// The feed reuses the hub's `threads-1` message-page shape. Provenance (who
/// wrote a message) is display-only: nothing on the phone grants authority
/// from it. Owner-only actions rely on the owner session plus the device
/// signature, never on a message's author.
library;

import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

/// One `GET /v1/iris/feed` page in the `threads-1` page shape, with rows in
/// the `threads-1` message model, oldest first (newest last).
final class IrisFeedPage {
  const IrisFeedPage({
    required this.messages,
    required this.nextBefore,
    this.nextAfter,
  });

  final List<ThreadMessage> messages;

  /// The cursor for the next older page; null when there is none.
  final String? nextBefore;

  /// On a forward poll (`?after=`): the cursor for the next poll.
  final String? nextAfter;
}

/// A send's progress. [pending] is local only (not yet accepted by the
/// relay); the rest are the relay's word, and they only move forward:
/// received → delivered → acked, or received → failed.
enum IrisReceiptState { pending, received, delivered, acked, failed }

/// How a delivered message reached Atlas: [start] began a turn on an idle
/// thread, [steer] joined a running turn, [queue] waits as the next turn and
/// [unknown] means the send succeeded without saying which. Only [queue] reads
/// as "queued".
enum IrisDelivery { start, steer, queue, unknown }

final class IrisReceipt {
  const IrisReceipt({required this.id, required this.state, this.delivery});

  final String id;
  final IrisReceiptState state;

  /// Set only on delivered and acked receipts.
  final IrisDelivery? delivery;

  bool get isTerminal =>
      state == IrisReceiptState.acked || state == IrisReceiptState.failed;
}

enum IrisRoleStatus { armed, running, stalled, idle }

final class IrisRoleLine {
  const IrisRoleLine({required this.role, required this.status});
  final String role;
  final IrisRoleStatus status;
}

/// `GET /v1/iris/summary`: "What needs me".
final class IrisSummary {
  const IrisSummary({
    required this.urgent,
    required this.soon,
    required this.fyi,
    this.roles = const [],
    this.usage,
  });

  final int urgent;
  final int soon;
  final int fyi;
  final List<IrisRoleLine> roles;

  /// One short usage line the relay words ("Claude 62% · resets 14:00").
  final String? usage;

  int get total => urgent + soon + fyi;
}

enum IrisDeviceStatus { pending, confirmed, expired, revoked }

final class IrisDevice {
  const IrisDevice({
    required this.id,
    required this.label,
    required this.status,
    required this.fingerprintPrefix,
    this.qa = false,
    this.current = false,
    this.createdAt,
    this.lastSeenAt,
  });

  final String id;
  final String label;
  final IrisDeviceStatus status;

  /// The first characters of the key fingerprint, to compare on the enrol page.
  final String fingerprintPrefix;
  final bool qa;

  /// The device that asked: this phone.
  final bool current;
  final DateTime? createdAt;
  final DateTime? lastSeenAt;
}

/// `POST /v1/iris/enrol`: the 6-digit code the owner confirms on the Iris
/// enrol page with their passkey. Pending until then; expires in 15 min.
final class IrisEnrollment {
  const IrisEnrollment({
    required this.deviceId,
    required this.code,
    required this.fingerprintPrefix,
    required this.expiresAt,
  });

  final String deviceId;
  final String code;
  final String fingerprintPrefix;
  final DateTime expiresAt;
}

/// Why a relay call did not produce a value. Never carries a body, header,
/// token or URL.
enum IrisFailureKind {
  notConfigured,

  /// This device has no confirmed hardware key, so nothing was sent.
  notEnrolled,

  /// The device key needs biometrics and the owner cancelled, is locked out,
  /// or the app could not ask. Never retried automatically, so a cancelled
  /// prompt does not come straight back.
  deviceLocked,

  /// The relay no longer knows this device (`device_revoked` or
  /// `unknown_device`). A confirmed enrolment is cleared and must start over.
  deviceRevoked,

  /// The relay refused the signature's timestamp (`clock_skew`). Never
  /// corrected automatically: the owner checks the device clock.
  clockSkew,

  /// Enrolment: another pending enrolment holds the 6-digit code.
  codeConflict,

  /// Enrolment: the relay already files this device id.
  deviceConflict,

  /// Enrolment while the kill switch is on (`assertion_required`): only the
  /// owner can restore the relay. Never retried.
  relayStopped,
  offline,
  unauthorized,
  forbidden,
  rateLimited,
  killed,
  notFound,
  badRequest,
  malformed,
  unavailable,
}

final class IrisFailure {
  const IrisFailure(this.kind, {this.retryAfter});

  final IrisFailureKind kind;

  /// From a 429's `Retry-After`; null when the relay did not say.
  final Duration? retryAfter;

  /// Worth an automatic retry with backoff: the relay may answer later.
  bool get transient =>
      kind == IrisFailureKind.offline ||
      kind == IrisFailureKind.rateLimited ||
      kind == IrisFailureKind.unavailable;
}

/// A relay call's outcome: a value, or a typed failure.
sealed class IrisResult<T> {
  const IrisResult();

  T? get valueOrNull => switch (this) {
    IrisOk<T>(:final value) => value,
    IrisErr<T>() => null,
  };

  IrisFailure? get failureOrNull => switch (this) {
    IrisOk<T>() => null,
    IrisErr<T>(:final failure) => failure,
  };
}

final class IrisOk<T> extends IrisResult<T> {
  const IrisOk(this.value);
  final T value;
}

final class IrisErr<T> extends IrisResult<T> {
  const IrisErr(this.failure);
  final IrisFailure failure;
}
