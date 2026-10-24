import 'dart:async';
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:mobile/data/sources/native_integrity/native_integrity_platform.dart';

typedef IntegrityPost =
    Future<Map<String, dynamic>> Function(
      String path,
      Map<String, dynamic> body,
    );

/// Proof preparation does not dispatch or replay the protected operation.
class NativeIntegrityClient {
  NativeIntegrityClient({NativeIntegrityPlatform? platform})
    : _platform = platform ?? DeviceIntegrityPlatform();

  final NativeIntegrityPlatform _platform;
  static final _requestLocks = <String, Future<void>>{};

  static Future<T> runRequest<T>(String scope, Future<T> Function() run) async {
    final prior = _requestLocks[scope] ?? Future<void>.value();
    final pending = prior.then((_) => run());
    final drained = pending.then<void>((_) {}, onError: (Object _) {});
    _requestLocks[scope] = drained;
    try {
      return await pending;
    } finally {
      if (identical(_requestLocks[scope], drained)) {
        _requestLocks.removeWhere((key, _) => key == scope);
      }
    }
  }

  static final _appleLocks = <String, Future<void>>{};

  static bool protects(String rawPath) {
    final path = rawPath.split('?').first;
    return RegExp(r'^/api/v1/users/calendar-settings/?$').hasMatch(path) ||
        RegExp(
          r'^/api/v1/workspaces/[^/]+/calendar-settings/?$',
        ).hasMatch(path);
  }

  static String digest(String body) => base64UrlEncode(
    sha256.convert(utf8.encode(body)).bytes,
  ).replaceAll('=', '');

  Future<Map<String, String>> headers({
    required String actor,
    required Uri origin,
    required String method,
    required String path,
    required String body,
    required IntegrityPost post,
    bool forceTurnstile = false,
  }) async {
    Map<String, dynamic> challenge;
    final binding = {
      'method': method,
      'path': path.split('?').first,
      'bodyHash': digest(body),
    };
    try {
      challenge = await post('/api/v1/native-integrity/challenge', {
        'purpose': 'request',
        ...binding,
      });
    } on Object {
      // Discovery failure retains the existing authenticated server decision.
      return _none;
    }
    final mode = challenge['mode'];
    if (mode == 'off') return const {};
    if (mode != 'monitor' && mode != 'enforce') return _none;
    try {
      _validateChallenge(challenge);
      if (!forceTurnstile) {
        final kind = await _platform.kind();
        if (kind == IntegrityPlatformKind.apple) {
          final scope = '${origin.origin}:$actor';
          return await _serialize(scope, () async {
            final keyId = await _platform.appleKey(scope);
            if (!await _platform.isEnrolled(scope, keyId)) {
              final enrollment = await post(
                '/api/v1/native-integrity/challenge',
                {'purpose': 'enroll', ...binding, 'keyId': keyId},
              );
              _validateChallenge(enrollment);
              final attestation = await _platform.attest(
                keyId,
                enrollment['requestHash'] as String,
              );
              final enrolled = await post('/api/v1/native-integrity/enroll', {
                'challengeId': enrollment['challengeId'],
                'keyId': keyId,
                'attestation': attestation,
              });
              if (enrolled['verified'] != true) {
                throw StateError('App Attest enrollment was not verified');
              }
              await _platform.markEnrolled(scope, keyId);
            }
            return _proof('app-attest', challenge, {
              'keyId': keyId,
              'assertion': await _platform.assertion(
                keyId,
                challenge['requestHash'] as String,
              ),
            });
          });
        }
        if (kind == IntegrityPlatformKind.android) {
          final project = challenge['cloudProjectNumber'];
          if (project is! String || !RegExp(r'^\d+$').hasMatch(project)) {
            throw const FormatException('Missing integrity project');
          }
          return _proof('play-integrity', challenge, {
            'token': await _platform.playIntegrity(
              project,
              challenge['requestHash'] as String,
            ),
          });
        }
      }
    } on Object {
      // One fallback below; neither native nor WebView errors replay a write.
    }
    try {
      _validateChallenge(challenge);
      final url = Uri.parse(challenge['turnstileUrl'] as String);
      if (url.scheme != 'https' ||
          url.origin != origin.origin ||
          url.path != '/native-integrity/turnstile' ||
          url.userInfo.isNotEmpty) {
        throw const FormatException('Untrusted integrity page');
      }
      return _proof('turnstile', challenge, {
        'token': await _platform
            .turnstile(url, challenge['requestHash'] as String)
            .timeout(const Duration(seconds: 22)),
      });
    } on Object {
      // The server alone decides whether proof is required; monitor never
      // substitutes attestation for auth, MFA, membership, quotas or IP blocks.
      return _none;
    }
  }

  static const _none = {'x-tuturuuu-native-integrity': 'none'};

  static void _validateChallenge(Map<String, dynamic> value) {
    final hash = value['requestHash'];
    final id = value['challengeId'];
    final expiry = value['expiresAt'];
    final expires = expiry is int && expiry > 0 && expiry < 8640000000000000
        ? DateTime.fromMillisecondsSinceEpoch(expiry)
        : null;
    if (hash is! String ||
        !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(hash) ||
        id is! String ||
        id.isEmpty ||
        id.length > 200 ||
        expires == null ||
        !expires.isAfter(DateTime.now())) {
      throw const FormatException('Invalid integrity challenge');
    }
  }

  static Map<String, String> _proof(
    String mechanism,
    Map<String, dynamic> challenge,
    Map<String, String> proof,
  ) => {
    'x-tuturuuu-native-integrity': mechanism,
    'x-tuturuuu-integrity-proof': base64UrlEncode(
      utf8.encode(
        jsonEncode({'challengeId': challenge['challengeId'], ...proof}),
      ),
    ).replaceAll('=', ''),
  };

  static Future<T> _serialize<T>(String scope, Future<T> Function() run) async {
    final prior = _appleLocks[scope] ?? Future<void>.value();
    final pending = prior.then((_) => run());
    final drained = pending.then<void>((_) {}, onError: (Object _) {});
    _appleLocks[scope] = drained;
    try {
      return await pending;
    } finally {
      if (identical(_appleLocks[scope], drained)) {
        _appleLocks.removeWhere((key, _) => key == scope);
      }
    }
  }
}
