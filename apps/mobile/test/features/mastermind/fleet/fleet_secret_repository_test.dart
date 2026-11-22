import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_repository.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_answer.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/mastermind_fleet_fixture.dart';
import 'secret_test_support.dart';

class _Api extends Mock implements ApiClient {}

// Design: apps/docs/build/devops/mastermind-secret-entry.mdx#platform-checks-fail-closed
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Api api;
  setUp(() {
    api = _Api();
    when(
      () => api.getJsonWithHeaders(any(), any()),
    ).thenAnswer((_) async => fleetSampleJson());
  });

  Future<String> features(FleetRepository repository) async {
    await repository.fetch();
    final headers =
        verify(
              () => api.getJsonWithHeaders(any(), captureAny()),
            ).captured.single
            as Map<String, String>;
    return headers['x-mastermind-fleet-features']!;
  }

  group('feature header', () {
    test('omits secret until the Inbox renders secret cards', () async {
      expect(fleetSecretCardsReady, isFalse);
      expect(
        await features(
          FleetRepository(api: api, secretSupported: () async => true),
        ),
        'login,alerts,review,mobile-issues',
      );
    });

    test('declares secret on a supported phone once cards are ready', () async {
      expect(
        await features(
          FleetRepository(
            api: api,
            secretSupported: () async => true,
            secretCardsReady: true,
          ),
        ),
        'login,alerts,review,mobile-issues,secret',
      );
    });

    test('never declares secret off iOS 17 or without the plugin', () async {
      for (final supported in [
        () async => false,
        () async => throw StateError('plugin'),
      ]) {
        api = _Api();
        when(
          () => api.getJsonWithHeaders(any(), any()),
        ).thenAnswer((_) async => fleetSampleJson());
        expect(
          await features(
            FleetRepository(
              api: api,
              secretSupported: supported,
              secretCardsReady: true,
            ),
          ),
          'login,alerts,review,mobile-issues',
        );
      }
    });

    test('the plugin reports unsupported on Android and without it', () async {
      final platform = FakeSecretPlatform()..install();
      addTearDown(platform.uninstall);
      expect(await FleetSecretCrypto(isIOS: () => false).supported(), isFalse);
      expect(platform.calls, isEmpty);
      expect(await FleetSecretCrypto(isIOS: () => true).supported(), isTrue);
      platform.uninstall();
      expect(await FleetSecretCrypto(isIOS: () => true).supported(), isFalse);
      debugDefaultTargetPlatformOverride = TargetPlatform.android;
      addTearDown(() => debugDefaultTargetPlatformOverride = null);
      expect(await FleetSecretCrypto().supported(), isFalse);
    });
  });

  group('answers', () {
    const owner = FleetSecretOwnerProof(
      publicKey: 'pk',
      keyId: 'kid',
      signedAt: '2026-11-22T10:05:00.000Z',
      sig: 'sig',
    );

    test('posts each answer body with its key, outside the outbox', () async {
      when(() => api.postJson(any(), any())).thenAnswer((_) async => {});
      final repository = FleetRepository(api: api);
      for (final answer in <FleetSecretAnswer>[
        const FleetSecretValueAnswer(enc: 'e', ct: 'c', owner: owner),
        const FleetSecretDeclineAnswer(owner: owner),
        const FleetSecretPairAnswer(ownerKey: 'ok', ownerMac: 'om'),
      ]) {
        await repository.answerSecret(
          decisionId: 'secret-0123456789abcdef01234567',
          answer: answer,
          idempotencyKey: 'key-1',
        );
      }
      final bodies = verify(
        () => api.postJson(
          FleetRepository.answerPath('secret-0123456789abcdef01234567'),
          captureAny(),
        ),
      ).captured.cast<Map<String, Object?>>();
      expect(bodies[0], {
        'action': 'secret',
        'sealed': {'enc': 'e', 'ct': 'c'},
        'owner': owner.toJson(),
        'idempotencyKey': 'key-1',
      });
      expect(bodies[1], {
        'action': 'decline',
        'owner': owner.toJson(),
        'idempotencyKey': 'key-1',
      });
      expect(bodies[2], {
        'action': 'pair',
        'pair': {'ownerKey': 'ok', 'ownerMac': 'om'},
        'idempotencyKey': 'key-1',
      });
    });

    test('maps refusals to closed categories', () {
      FleetSecretSendFailure of(Object error) =>
          FleetSecretSendException.from(error).failure;
      expect(
        of(const ApiException(message: 'mfa_required', statusCode: 401)),
        FleetSecretSendFailure.mfaRequired,
      );
      expect(
        of(const ApiException(message: 'secret_closed', statusCode: 409)),
        FleetSecretSendFailure.closed,
      );
      expect(
        of(const ApiException(message: 'invalid_answer', statusCode: 422)),
        FleetSecretSendFailure.notDelivered,
      );
      expect(
        of(const ApiException(message: 'forbidden', statusCode: 403)),
        FleetSecretSendFailure.forbidden,
      );
      expect(
        of(const ApiException(message: 'busy', statusCode: 503)),
        FleetSecretSendFailure.unavailable,
      );
      expect(
        of(const ApiException(message: 'slow', statusCode: 429)),
        FleetSecretSendFailure.unavailable,
      );
    });
  });
}
