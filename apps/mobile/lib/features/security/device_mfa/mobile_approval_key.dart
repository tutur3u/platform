import 'dart:convert';

import 'package:flutter/services.dart';

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

  Uint8List message({required String action, required String value}) =>
      Uint8List.fromList(
        utf8.encode(
          jsonEncode([
            'tuturuuu.mobile-approval.v2',
            challengeId,
            nonce,
            requesterSessionId,
            decidingSessionId,
            action,
            value,
            expiresAt,
          ]),
        ),
      );
}

/// The platform returns only the P-256 public key and ECDSA signatures.
/// Signing is authorized by the operating system for that individual request.
final class MobileApprovalKey {
  const MobileApprovalKey({
    MethodChannel channel = const MethodChannel('mobile/approval_key'),
  }) : _channel = channel;

  final MethodChannel _channel;

  Future<String> ensurePublicKey(String accountId) async {
    final spki = await _channel.invokeMethod<Uint8List>('ensureKey', {
      'accountId': accountId,
    });
    if (spki == null || spki.length != 91) {
      throw PlatformException(code: 'invalid_approval_key');
    }
    return base64.encode(spki);
  }

  Future<String> sign({
    required String accountId,
    required MobileApprovalSignatureInput input,
    required String action,
    required String value,
    required String reason,
  }) async {
    final signature = await _channel.invokeMethod<Uint8List>('sign', {
      'accountId': accountId,
      'data': input.message(action: action, value: value),
      'reason': reason,
    });
    if (signature == null || signature.isEmpty) {
      throw PlatformException(code: 'invalid_approval_signature');
    }
    return base64Url.encode(signature).replaceAll('=', '');
  }
}
