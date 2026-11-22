import 'package:mobile/data/sources/api_client.dart';

/// Why Web refused or could not take a secret answer, as a closed category.
///
/// [mfaRequired] (401 `mfa_required`) keeps the same sealed payload and key
/// for a resend after the step-up; [closed] (409 `secret_closed`) ends the
/// screen; [notDelivered] (422) means Web refused this answer, so nothing
/// reached the machine; [unavailable] (network, 5xx, 429) is the only kind
/// an in-memory resend can fix.
enum FleetSecretSendFailure {
  mfaRequired,
  closed,
  notDelivered,
  forbidden,
  rejected,
  unavailable,
}

class FleetSecretSendException implements Exception {
  const FleetSecretSendException(this.failure);

  factory FleetSecretSendException.from(Object error) => switch (error) {
    FleetSecretSendException() => error,
    ApiException(statusCode: 401, message: 'mfa_required') =>
      const FleetSecretSendException(FleetSecretSendFailure.mfaRequired),
    ApiException(statusCode: 409) => const FleetSecretSendException(
      FleetSecretSendFailure.closed,
    ),
    ApiException(statusCode: 422) => const FleetSecretSendException(
      FleetSecretSendFailure.notDelivered,
    ),
    ApiException(isVerificationRequired: true) ||
    ApiException(
      statusCode: 401 || 403,
    ) => const FleetSecretSendException(FleetSecretSendFailure.forbidden),
    ApiException(:final statusCode)
        when statusCode >= 400 &&
            statusCode < 500 &&
            statusCode != 408 &&
            statusCode != 429 =>
      const FleetSecretSendException(FleetSecretSendFailure.rejected),
    _ => const FleetSecretSendException(FleetSecretSendFailure.unavailable),
  };

  final FleetSecretSendFailure failure;

  bool get retryable => failure == FleetSecretSendFailure.unavailable;
}

/// The owner's signature over an answer's transcript.
class FleetSecretOwnerProof {
  const FleetSecretOwnerProof({
    required this.publicKey,
    required this.keyId,
    required this.signedAt,
    required this.sig,
  });

  final String publicKey;
  final String keyId;
  final String signedAt;
  final String sig;

  Map<String, String> toJson() => {
    'publicKey': publicKey,
    'keyId': keyId,
    'signedAt': signedAt,
    'sig': sig,
  };
}

/// One answer to a `secret` decision. It holds ciphertext, signatures and
/// MACs only, and lives in memory: it is never written to the answer outbox.
sealed class FleetSecretAnswer {
  const FleetSecretAnswer();

  Map<String, Object?> toJson();
}

class FleetSecretValueAnswer extends FleetSecretAnswer {
  const FleetSecretValueAnswer({
    required this.enc,
    required this.ct,
    required this.owner,
  });

  final String enc;
  final String ct;
  final FleetSecretOwnerProof owner;

  @override
  Map<String, Object?> toJson() => {
    'action': 'secret',
    'sealed': {'enc': enc, 'ct': ct},
    'owner': owner.toJson(),
  };
}

class FleetSecretDeclineAnswer extends FleetSecretAnswer {
  const FleetSecretDeclineAnswer({required this.owner});

  final FleetSecretOwnerProof owner;

  @override
  Map<String, Object?> toJson() => {
    'action': 'decline',
    'owner': owner.toJson(),
  };
}

class FleetSecretPairAnswer extends FleetSecretAnswer {
  const FleetSecretPairAnswer({required this.ownerKey, required this.ownerMac});

  final String ownerKey;
  final String ownerMac;

  @override
  Map<String, Object?> toJson() => {
    'action': 'pair',
    'pair': {'ownerKey': ownerKey, 'ownerMac': ownerMac},
  };
}

/// Posts secret answers straight to Web, with no outbox.
abstract interface class FleetSecretAnswerSource {
  /// Throws [FleetSecretSendException]. [idempotencyKey] is a fresh v4 UUID
  /// per answer, reused only when this same answer is sent again.
  Future<void> answerSecret({
    required String decisionId,
    required FleetSecretAnswer answer,
    required String idempotencyKey,
  });
}
