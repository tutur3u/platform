import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/security/qr_login/data/qr_login_repository.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  group('QrLoginRepository', () {
    late _MockApiClient apiClient;
    late QrLoginRepository repository;

    setUp(() {
      apiClient = _MockApiClient();
      repository = QrLoginRepository(apiClient: apiClient);
    });

    test('creates a mobile login challenge without an auth session', () async {
      when(
        () => apiClient.postJson(AuthEndpoints.qrLoginChallenges, {
          'locale': 'en',
          'origin': 'https://tuturuuu.com',
        }, requiresAuth: false),
      ).thenAnswer(
        (_) async => {
          'success': true,
          'expiresIn': 300,
          'challenge': {
            'id': 'challenge-1',
            'payload': 'tuturuuu://auth/qr-login?challengeId=challenge-1',
            'expiresAt': '2026-05-06T00:00:00.000Z',
            'status': 'pending',
          },
        },
      );

      final result = await repository.createLoginChallenge(
        locale: 'en',
        origin: 'https://tuturuuu.com',
      );

      expect(result.success, isTrue);
      expect(result.challenge?.id, 'challenge-1');
      expect(result.challenge?.payload, contains('challenge-1'));
      expect(result.expiresIn, 300);
    });

    test('polls a challenge without an auth session', () async {
      when(
        () => apiClient.getJson(
          '${AuthEndpoints.qrLoginChallenge('challenge-1')}?'
          '${Uri(queryParameters: {'secret': 'secret-token'}).query}',
          requiresAuth: false,
        ),
      ).thenAnswer(
        (_) async => {
          'success': true,
          'status': 'approved',
          'session': {
            'access_token': 'access-token',
            'refresh_token': 'refresh-token',
            'expires_in': 3600,
            'expires_at': 1,
            'token_type': 'bearer',
          },
        },
      );

      final result = await repository.pollLoginChallenge(
        challengeId: 'challenge-1',
        secret: 'secret-token',
      );

      expect(result.success, isTrue);
      expect(result.status, QrLoginChallengeStatus.approved);
      expect(result.session?.refreshToken, 'refresh-token');
    });
  });
}
