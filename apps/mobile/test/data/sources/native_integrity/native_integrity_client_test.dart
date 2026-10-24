import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/native_integrity/native_integrity_client.dart';
import 'package:mobile/data/sources/native_integrity/native_integrity_platform.dart';

class FakePlatform implements NativeIntegrityPlatform {
  IntegrityPlatformKind platform = IntegrityPlatformKind.other;
  bool enrolled = false;
  bool failNative = false;
  bool failWeb = false;
  int nativeCalls = 0;
  int webCalls = 0;
  int attestations = 0;
  final scopes = <String>[];
  @override
  Future<IntegrityPlatformKind> kind() async {
    nativeCalls++;
    return platform;
  }

  @override
  Future<String> appleKey(String scope) async {
    scopes.add(scope);
    return 'key';
  }

  @override
  Future<bool> isEnrolled(String scope, String keyId) async => enrolled;
  @override
  Future<void> markEnrolled(String scope, String keyId) async {
    enrolled = true;
  }

  @override
  Future<String> attest(String keyId, String requestHash) async {
    attestations++;
    return 'attestation';
  }

  @override
  Future<String> assertion(String keyId, String requestHash) async {
    if (failNative) throw StateError('unavailable');
    return 'assertion';
  }

  @override
  Future<String> playIntegrity(String project, String requestHash) async {
    if (failNative) throw StateError('unavailable');
    expect(project, '123');
    expect(requestHash, NativeIntegrityClient.digest('challenge'));
    return 'standard-token';
  }

  @override
  Future<String> turnstile(Uri url, String requestHash) async {
    webCalls++;
    if (failWeb) throw StateError('unavailable');
    return 'turnstile-token';
  }
}

void main() {
  Map<String, dynamic> challenge({String mode = 'enforce'}) => {
    'mode': mode,
    'challengeId': 'challenge-id',
    'requestHash': NativeIntegrityClient.digest('challenge'),
    'expiresAt': DateTime.now()
        .add(const Duration(minutes: 2))
        .millisecondsSinceEpoch,
    'cloudProjectNumber': '123',
    'turnstileUrl': 'https://tuturuuu.com/native-integrity/turnstile',
  };
  Future<Map<String, String>> prepare(
    FakePlatform platform, {
    String mode = 'enforce',
    bool verified = true,
    bool fallback = false,
    String actor = 'actor',
    Map<String, dynamic>? response,
  }) => NativeIntegrityClient(platform: platform).headers(
    actor: actor,
    origin: Uri.parse('https://tuturuuu.com'),
    method: 'PATCH',
    path: '/api/v1/users/calendar-settings',
    body: '{"timezone":"UTC"}',
    forceTurnstile: fallback,
    post: (path, body) async {
      if (path.endsWith('/enroll')) return {'verified': verified};
      expect(
        body['bodyHash'],
        NativeIntegrityClient.digest('{"timezone":"UTC"}'),
      );
      expect(body['method'], 'PATCH');
      return response ?? challenge(mode: mode);
    },
  );

  test('off mode never invokes device or widget', () async {
    final platform = FakePlatform();
    expect(await prepare(platform, mode: 'off'), isEmpty);
    expect(platform.nativeCalls, 0);
    expect(platform.webCalls, 0);
  });
  test('Android uses STANDARD requestHash token', () async {
    final platform = FakePlatform()..platform = IntegrityPlatformKind.android;
    final result = await prepare(platform);
    expect(result['x-tuturuuu-native-integrity'], 'play-integrity');
    final proof = jsonDecode(
      utf8.decode(
        base64Url.decode(
          base64Url.normalize(result['x-tuturuuu-integrity-proof']!),
        ),
      ),
    );
    expect(proof, {'challengeId': 'challenge-id', 'token': 'standard-token'});
    expect(platform.webCalls, 0);
  });
  test(
    'Apple enrolls once then asserts; actor scopes remain distinct',
    () async {
      final platform = FakePlatform()..platform = IntegrityPlatformKind.apple;
      expect(
        (await prepare(platform))['x-tuturuuu-native-integrity'],
        'app-attest',
      );
      await prepare(platform, actor: 'other');
      expect(platform.attestations, 1);
      expect(platform.scopes, [
        'https://tuturuuu.com:actor',
        'https://tuturuuu.com:other',
      ]);
    },
  );
  test('monitor enrollment acceptance is not verified enrollment', () async {
    final platform = FakePlatform()..platform = IntegrityPlatformKind.apple;
    final result = await prepare(platform, mode: 'monitor', verified: false);
    expect(platform.enrolled, false);
    expect(result['x-tuturuuu-native-integrity'], 'turnstile');
  });
  for (final name in ['unsupported Apple', 'Linux', 'Windows', 'web']) {
    test('$name selects Turnstile without assuming Apple support', () async {
      final platform = FakePlatform();
      expect(
        (await prepare(platform))['x-tuturuuu-native-integrity'],
        'turnstile',
      );
      expect(platform.webCalls, 1);
    });
  }
  test(
    'native failure makes one fallback, monitor errors preserve server gate',
    () async {
      final platform = FakePlatform()
        ..platform = IntegrityPlatformKind.android
        ..failNative = true
        ..failWeb = true;
      expect(await prepare(platform, mode: 'monitor'), {
        'x-tuturuuu-native-integrity': 'none',
      });
      expect(platform.webCalls, 1);
    },
  );
  test(
    'forced fallback skips native proof and does not accept external page',
    () async {
      final platform = FakePlatform()..platform = IntegrityPlatformKind.android;
      await prepare(platform, fallback: true);
      expect(platform.nativeCalls, 0);
      expect(platform.webCalls, 1);
      await prepare(
        platform,
        response: {
          ...challenge(),
          'turnstileUrl': 'https://evil.test/native-integrity/turnstile',
        },
      );
      // Android succeeds, so force fallback to test untrusted URL handling.
      final result = await prepare(
        platform,
        fallback: true,
        response: {
          ...challenge(),
          'turnstileUrl': 'https://evil.test/native-integrity/turnstile',
        },
      );
      expect(result['x-tuturuuu-native-integrity'], 'none');
      expect(platform.webCalls, 1);
    },
  );
  test('expired challenge cannot invoke proof providers', () async {
    final platform = FakePlatform();
    final result = await prepare(
      platform,
      response: {...challenge(), 'expiresAt': 1},
    );
    expect(result['x-tuturuuu-native-integrity'], 'none');
    expect(platform.webCalls, 0);
  });
  test(
    'request lock includes transport response before next assertion',
    () async {
      final firstResponse = Completer<void>();
      final log = <String>[];
      final first = NativeIntegrityClient.runRequest('actor:origin', () async {
        log.add('assert1/send1');
        await firstResponse.future;
        log.add('response1');
      });
      final second = NativeIntegrityClient.runRequest('actor:origin', () async {
        log.add('assert2/send2/response2');
      });
      await Future<void>.delayed(Duration.zero);
      expect(log, ['assert1/send1']);
      firstResponse.complete();
      await Future.wait([first, second]);
      expect(log, ['assert1/send1', 'response1', 'assert2/send2/response2']);
    },
  );
}
