import 'dart:convert';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Routing hint only. API and database enforcement use fresh server policy.
bool requiresAccountMfa(Session? session) {
  final metadata = session?.user.appMetadata;
  if (metadata == null || !metadata.containsKey('tuturuuu_required_mfa')) {
    return false;
  }
  final policy = metadata['tuturuuu_required_mfa'];
  if (policy is! Map) return true;
  if (policy['required'] == false) return false;
  if ((policy.containsKey('recoveryInProgress') &&
          policy['recoveryInProgress'] != false) ||
      requiresFreshPrimaryForMfa(session)) {
    return true;
  }
  final boundary = policy['verifiedAfter'];
  if (policy['required'] != true || boundary is! int || boundary < 0) {
    return true;
  }
  try {
    final parts = session!.accessToken.split('.');
    final claims =
        jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))))
            as Map<String, dynamic>;
    if (claims['exp'] is! int ||
        (claims['exp'] as int) <=
            DateTime.now().millisecondsSinceEpoch ~/ 1000) {
      return true;
    }
    if (claims['aal'] != 'aal2' || claims['session_id'] is! String) return true;
    final amr = claims['amr'];
    if (amr is! List) return true;
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    return !amr.any(
      (entry) =>
          entry is Map &&
          const [
            'totp',
            'mfa/phone',
            'mfa/webauthn',
            'mfa/recovery_code',
          ].contains(entry['method']) &&
          entry['timestamp'] is int &&
          (entry['timestamp'] as int) > boundary &&
          (entry['timestamp'] as int) <= now,
    );
  } on Object {
    return true;
  }
}

Future<void> refreshRequiredMfa(GoTrueClient auth) async {
  try {
    await auth.refreshSession();
  } on Object {
    // Keep the original denial when refresh fails.
  }
}

/// Recovery must not reuse a primary session created before the reset.
bool requiresFreshPrimaryForMfa(Session? session) {
  final policy = session?.user.appMetadata['tuturuuu_required_mfa'];
  if (policy is! Map ||
      policy['required'] == false ||
      !policy.containsKey('primaryVerifiedAfter')) {
    return false;
  }
  final boundary = policy['primaryVerifiedAfter'];
  if (boundary is! int || boundary < 0) return true;
  try {
    final claims =
        jsonDecode(
              utf8.decode(
                base64Url.decode(
                  base64Url.normalize(session!.accessToken.split('.')[1]),
                ),
              ),
            )
            as Map<String, dynamic>;
    final amr = claims['amr'];
    if (amr is! List) return true;
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    return !amr.any(
      (entry) =>
          entry is Map &&
          const [
            'password',
            'otp',
            'oauth',
            'sso/saml',
            'sso',
            'magiclink',
            'recovery',
            'invite',
            'passkey',
            'web3',
            'email/signup',
            'phone/signup',
          ].contains(entry['method']) &&
          entry['timestamp'] is int &&
          (entry['timestamp'] as int) > boundary &&
          (entry['timestamp'] as int) <= now,
    );
  } on Object {
    return true;
  }
}
