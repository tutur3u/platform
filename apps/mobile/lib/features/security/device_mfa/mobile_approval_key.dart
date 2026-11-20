import 'dart:convert';

import 'package:flutter/services.dart';

enum MobileApprovalAction { approve, reject, enroll }

/// The nonce and session IDs come from the server. Preserve the exact expiry
/// string on the wire so that both sides sign the same bytes.
final class MobileApprovalSignatureInput {
  const MobileApprovalSignatureInput({
    required this.challengeId,
    required this.nonce,
    required this.requesterSessionId,
    required this.decidingSessionId,
    required this.expiresAt,
  });

  final String challengeId;
  final String nonce;
  final String requesterSessionId;
  final String decidingSessionId;
  final String expiresAt;

  Uint8List message({
    required MobileApprovalAction action,
    required String value,
  }) => Uint8List.fromList(
    utf8.encode(
      jsonEncode([
        'tuturuuu.mobile-approval.v2',
        challengeId,
        nonce,
        requesterSessionId,
        decidingSessionId,
        action.name,
        value,
        expiresAt,
      ]),
    ),
  );
}

final class MobileApprovalKeyEnrollment {
  const MobileApprovalKeyEnrollment._({
    required this.publicKey,
    required this.securityLevel,
    this.certificateChain,
    this.attestationKeyId,
    this.attestation,
  });

  final String publicKey;
  final String securityLevel;
  final List<String>? certificateChain;
  final String? attestationKeyId;
  final String? attestation;
}

/// The platform returns the P-256 public key and attestation, or a
/// user-verified signature. The signer uses the signed bytes to derive the
/// system prompt.
final class MobileApprovalKey {
  const MobileApprovalKey({
    MethodChannel channel = const MethodChannel('mobile/approval_key'),
  }) : _channel = channel;

  final MethodChannel _channel;

  Future<MobileApprovalKeyEnrollment> prepareEnrollment({
    required String accountId,
    required String keyId,
    required Uint8List challenge,
  }) async {
    final reply = await _channel.invokeMapMethod<String, Object?>(
      'prepareEnrollment',
      {'accountId': accountId, 'keyId': keyId, 'challenge': challenge},
    );
    final publicKey = reply?['publicKey'];
    final securityLevel = reply?['securityLevel'];
    if (publicKey is! String || publicKey.length != 124) {
      throw PlatformException(code: 'invalid_approval_key');
    }
    if (securityLevel == 'secure_enclave') {
      final keyId = reply?['attestationKeyId'];
      final attestation = reply?['attestation'];
      if (keyId is String && attestation is String) {
        return MobileApprovalKeyEnrollment._(
          publicKey: publicKey,
          securityLevel: 'secure_enclave',
          attestationKeyId: keyId,
          attestation: attestation,
        );
      }
    }
    final chain = reply?['certificateChain'];
    if (securityLevel is String &&
        const {'strongbox', 'tee', 'hardware'}.contains(securityLevel) &&
        chain is List<Object?> &&
        chain.length >= 2 &&
        chain.length <= 8 &&
        chain.every((value) => value is String)) {
      return MobileApprovalKeyEnrollment._(
        publicKey: publicKey,
        securityLevel: securityLevel,
        certificateChain: chain.cast<String>().toList(growable: false),
      );
    }
    throw PlatformException(code: 'invalid_approval_attestation');
  }

  Future<String> sign({
    required String accountId,
    required String keyId,
    required MobileApprovalSignatureInput input,
    required MobileApprovalAction action,
    required String value,
  }) async {
    final signature = await _channel.invokeMethod<Uint8List>('sign', {
      'accountId': accountId,
      'keyId': keyId,
      'data': input.message(action: action, value: value),
    });
    if (signature == null || signature.isEmpty) {
      throw PlatformException(code: 'invalid_approval_signature');
    }
    return base64Url.encode(signature).replaceAll('=', '');
  }

  /// Passing an account clears every pending and enrolled key for that account.
  /// A device-wide sign-out clears all approval keys.
  Future<void> deleteKeys({String? accountId}) async {
    await _channel.invokeMethod<void>('deleteKeys', {
      if (accountId != null) 'accountId': accountId,
    });
  }
}
