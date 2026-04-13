import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/data/repositories/version_check_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  group('VersionCheckRepository', () {
    late _MockApiClient apiClient;

    setUp(() {
      apiClient = _MockApiClient();
    });

    test('maps version-check response payload', () async {
      when(
        () => apiClient.getJson(
          '${MobileEndpoints.versionCheck}?platform=android&version=1.2.0',
          requiresAuth: false,
        ),
      ).thenAnswer(
        (_) async => {
          'platform': 'android',
          'currentVersion': '1.2.0',
          'effectiveVersion': '1.3.0',
          'minimumVersion': '1.1.0',
          'otpEnabled': true,
          'storeUrl':
              'https://play.google.com/store/apps/details?id=example.app',
          'status': 'update-recommended',
          'shouldUpdate': true,
          'requiresUpdate': false,
        },
      );

      final repository = VersionCheckRepository(
        apiClient: apiClient,
        installedVersionLoader: () async => '1.2.0',
        platformLoader: () => 'android',
      );

      final result = await repository.checkCurrentVersion();

      expect(result, isNotNull);
      expect(result!.status, MobileUpdateStatus.updateRecommended);
      expect(result.currentVersion, '1.2.0');
      expect(result.effectiveVersion, '1.3.0');
      expect(result.otpEnabled, isTrue);
      expect(result.requiresUpdate, isFalse);
    });

    test('returns null on unsupported platforms', () async {
      final repository = VersionCheckRepository(
        apiClient: apiClient,
        installedVersionLoader: () async => '1.2.0',
        platformLoader: () => null,
      );

      final result = await repository.checkCurrentVersion();

      expect(result, isNull);
      verifyNever(() => apiClient.getJson(any(), requiresAuth: false));
    });
  });
}
