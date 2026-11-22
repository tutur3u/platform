import 'package:flutter/foundation.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_pins.dart';

/// Where one secret request or pairing stands on this phone.
///
/// A request runs [verifying], then [stepUp], [input], [sealing], [sent],
/// [pickedUp] and [outcome]; it stops at [blocked] or [needsPairing] when
/// verification fails, and at [closed] when the decision leaves the
/// snapshot. A pairing takes the same path with the code in [input].
enum FleetSecretPhase {
  verifying,
  blocked,
  needsPairing,
  stepUp,
  input,
  sealing,
  sent,
  pickedUp,
  outcome,
  closed,
}

/// Why the phone shows no input. Each one is a closed reason the page
/// explains; none carries server or machine text.
enum FleetSecretBlock {
  /// Not iOS 17 or later with the CryptoKit plugin.
  unsupported,
  signedOut,

  /// The decision id differs from the id the machine signed.
  idMismatch,

  /// Paired, but the machine has not confirmed this phone's key yet.
  pendingPin,

  /// Signed by a key other than the active pin.
  keyChanged,
  badSignature,

  /// This phone's owner key is not in the signed audience.
  notInAudience,

  /// The SSH line does not quote the remote arguments it shows.
  quoting,

  /// Less than 45 seconds remain.
  expiring,

  /// Five wrong pairing codes.
  locked,

  /// Web refused the answer (422 or another 4xx); nothing reached the
  /// machine.
  notDelivered,

  /// The session cannot answer fleet decisions any more.
  forbidden,

  /// CryptoKit or the Keychain failed, or the answer could not be sent in
  /// time.
  failed,
}

/// The pairing code the owner typed did not prove the machine's MAC.
enum FleetSecretCodeError { malformed, wrong }

/// What the machine reported, as checked on this phone.
@immutable
class FleetSecretSettled {
  const FleetSecretSettled({
    required this.outcome,
    required this.verified,
    required this.mine,
  });

  final FleetSecretOutcomeKind outcome;

  /// The signature verifies against the pinned machine key.
  final bool verified;

  /// The outcome names this phone's own answer (or key, for a pairing).
  final bool mine;
}

@immutable
class FleetSecretState {
  const FleetSecretState({
    this.phase = FleetSecretPhase.verifying,
    this.block,
    this.pin,
    this.requestCode,
    this.fingerprint,
    this.codeError,
    this.codesLeft,
    this.declined = false,
    this.retrying = false,
    this.resend = false,
    this.settled,
    this.forgettable = false,
  });

  final FleetSecretPhase phase;
  final FleetSecretBlock? block;

  /// The pin the request verified against (active) or the pairing recorded.
  final FleetSecretPin? pin;

  /// `XXXX-XXXX` of a request, to compare with the machine's printout.
  final String? requestCode;

  /// The machine key's fingerprint, to compare during pairing.
  final String? fingerprint;
  final FleetSecretCodeError? codeError;
  final int? codesLeft;

  /// The answer sent was a decline.
  final bool declined;

  /// Web could not be reached; the same answer is being sent again.
  final bool retrying;

  /// The step-up is for resending an answer already sealed and signed.
  final bool resend;
  final FleetSecretSettled? settled;

  /// The stored trust offers Forget: a pairing page for a machine that has
  /// a pin, or a request whose machine has a re-pairing waiting. Refreshed
  /// whenever the pins change.
  final bool forgettable;

  /// This state with only [forgettable] changed; every other field, the
  /// transient ones ([block], [codeError], [retrying], [resend]) included,
  /// stays as it is.
  FleetSecretState withForgettable(bool value) => FleetSecretState(
    phase: phase,
    block: block,
    pin: pin,
    requestCode: requestCode,
    fingerprint: fingerprint,
    codeError: codeError,
    codesLeft: codesLeft,
    declined: declined,
    retrying: retrying,
    resend: resend,
    settled: settled,
    forgettable: value,
  );

  bool get acceptsInput => phase == FleetSecretPhase.input;

  FleetSecretState copyWith({
    FleetSecretPhase? phase,
    FleetSecretBlock? block,
    FleetSecretPin? pin,
    String? requestCode,
    String? fingerprint,
    FleetSecretCodeError? codeError,
    int? codesLeft,
    bool? declined,
    bool? retrying,
    bool? resend,
    FleetSecretSettled? settled,
    bool? forgettable,
  }) => FleetSecretState(
    phase: phase ?? this.phase,
    block: block,
    pin: pin ?? this.pin,
    requestCode: requestCode ?? this.requestCode,
    fingerprint: fingerprint ?? this.fingerprint,
    codeError: codeError,
    codesLeft: codesLeft ?? this.codesLeft,
    declined: declined ?? this.declined,
    retrying: retrying ?? false,
    resend: resend ?? false,
    settled: settled ?? this.settled,
    forgettable: forgettable ?? this.forgettable,
  );
}
