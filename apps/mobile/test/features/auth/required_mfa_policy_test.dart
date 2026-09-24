import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/auth/required_mfa_policy.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

Session session({
  required Map<String, dynamic> metadata,
  int? proofTime,
  int? primaryTime,
  int? expiresAt,
}) {
  final claims = {
    'exp': expiresAt ?? DateTime.now().millisecondsSinceEpoch ~/ 1000 + 3600,
    'aal': proofTime == null ? 'aal1' : 'aal2',
    'session_id': 'session',
    'amr': [
      if (proofTime != null) {'method': 'totp', 'timestamp': proofTime},
      if (primaryTime != null) {'method': 'password', 'timestamp': primaryTime},
    ],
  };
  final token =
      'header.${base64Url.encode(utf8.encode(jsonEncode(claims)))}.signature';
  return Session.fromJson({
    'access_token': token,
    'token_type': 'bearer',
    'refresh_token': 'test',
    'user': {
      'id': 'actor',
      'aud': 'authenticated',
      'created_at': '2026-09-23T00:00:00Z',
      'app_metadata': metadata,
      'user_metadata': <String, dynamic>{},
    },
  })!;
}

void main() {
  test('recovery requires fresh primary authentication before new MFA', () {
    final metadata = {
      'tuturuuu_required_mfa': {
        'required': true,
        'verifiedAfter': 100,
        'primaryVerifiedAfter': 100,
      },
    };
    expect(
      requiresFreshPrimaryForMfa(
        session(metadata: metadata, proofTime: 102, primaryTime: 99),
      ),
      isTrue,
    );
    expect(
      requiresAccountMfa(
        session(metadata: metadata, proofTime: 102, primaryTime: 99),
      ),
      isTrue,
    );
    expect(
      requiresAccountMfa(
        session(metadata: metadata, proofTime: 102, primaryTime: 101),
      ),
      isFalse,
    );
  });
  test('in-progress recovery blocks otherwise fresh cached proofs', () {
    expect(
      requiresAccountMfa(
        session(
          metadata: {
            'tuturuuu_required_mfa': {
              'required': true,
              'verifiedAfter': 100,
              'recoveryInProgress': true,
            },
          },
          proofTime: 102,
          primaryTime: 101,
        ),
      ),
      isTrue,
    );
  });
  test('expired required proof gates cached navigation until refresh', () {
    final now = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    expect(
      requiresAccountMfa(
        session(
          metadata: {
            'tuturuuu_required_mfa': {
              'required': true,
              'verifiedAfter': now - 60,
            },
          },
          proofTime: now - 30,
          expiresAt: now - 1,
        ),
      ),
      isTrue,
    );
  });
  test(
    'optional cached session is not blocked by required-policy expiry logic',
    () {
      expect(requiresAccountMfa(session(metadata: {}, expiresAt: 1)), isFalse);
    },
  );

  test(
    'factorless required accounts must enroll before ordinary navigation',
    () {
      expect(
        requiresAccountMfa(
          session(
            metadata: {
              'tuturuuu_required_mfa': {'required': true, 'verifiedAfter': 100},
            },
          ),
        ),
        isTrue,
      );
    },
  );
  test(
    'reset invalidates previous verification without trusting refresh time',
    () {
      final metadata = {
        'tuturuuu_required_mfa': {'required': true, 'verifiedAfter': 100},
      };
      expect(
        requiresAccountMfa(session(metadata: metadata, proofTime: 100)),
        isTrue,
      );
      expect(
        requiresAccountMfa(session(metadata: metadata, proofTime: 101)),
        isFalse,
      );
    },
  );
  test(
    'missing policy preserves existing routing; malformed policy fails closed',
    () {
      expect(requiresAccountMfa(session(metadata: {})), isFalse);
      expect(
        requiresAccountMfa(session(metadata: {'tuturuuu_required_mfa': null})),
        isTrue,
      );
    },
  );
}
