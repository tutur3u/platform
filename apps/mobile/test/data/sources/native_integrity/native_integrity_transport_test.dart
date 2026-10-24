import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/native_integrity/native_integrity_client.dart';
import 'package:mobile/data/sources/native_integrity/native_integrity_platform.dart';

import '../../../helpers/timezone_http_harness.dart';
import 'native_integrity_client_test.dart' show FakePlatform;

void main() {
  test(
    'only authoritative pre-write rejection allows one Turnstile replay',
    () async {
      final platform = FakePlatform()..platform = IntegrityPlatformKind.android;
      final harness = TimezoneHttpHarness(
        nativeIntegrity: NativeIntegrityClient(platform: platform),
      );
      addTearDown(harness.dispose);
      harness
        ..integrityChallenge = {
          'mode': 'enforce',
          'challengeId': 'challenge-id',
          'requestHash': NativeIntegrityClient.digest('challenge'),
          'expiresAt': DateTime.now()
              .add(const Duration(minutes: 1))
              .millisecondsSinceEpoch,
          'cloudProjectNumber': '123',
          'turnstileUrl': 'https://tuturuuu.com/native-integrity/turnstile',
        }
        ..respond = (_) async => TimezoneHttpHarness.json({
          'code': 'NATIVE_INTEGRITY_REQUIRED',
        }, status: 403);
      await expectLater(
        harness.repository.savePersonal('UTC'),
        throwsA(isA<ApiException>()),
      );
      expect(harness.requests, hasLength(2));
      expect(
        harness.requests.first.headers['x-tuturuuu-native-integrity'],
        'play-integrity',
      );
      expect(
        harness.requests.last.headers['x-tuturuuu-native-integrity'],
        'turnstile',
      );
      expect(harness.requests.first.bodyBytes, harness.requests.last.bodyBytes);
      expect(platform.webCalls, 1);
    },
  );
  test('unknown PATCH outcome never falls back or replays', () async {
    final harness = TimezoneHttpHarness();
    addTearDown(harness.dispose);
    harness.respond = (_) async => throw TimeoutException('unknown outcome');
    await expectLater(
      harness.repository.savePersonal('UTC'),
      throwsA(isA<ApiException>()),
    );
    expect(harness.requests, hasLength(1));
  });
  test('generic forbidden PATCH never replays', () async {
    final harness = TimezoneHttpHarness();
    addTearDown(harness.dispose);
    harness.respond = (_) async =>
        TimezoneHttpHarness.json({'error': 'denied'}, status: 403);
    await expectLater(
      harness.repository.savePersonal('UTC'),
      throwsA(isA<ApiException>()),
    );
    expect(harness.requests, hasLength(1));
  });
}
