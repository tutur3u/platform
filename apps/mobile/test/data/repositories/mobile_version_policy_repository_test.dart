import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/mobile_version_policy.dart';
import 'package:mobile/data/repositories/mobile_version_policy_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mocktail/mocktail.dart';

class _MockApiClient extends Mock implements ApiClient {}

void main() {
  group('MobileVersionPolicyRepository', () {
    late _MockApiClient apiClient;

    setUp(() {
      apiClient = _MockApiClient();
    });

    test('maps the GET payload into normalized policies', () async {
      when(
        () => apiClient.getJson(MobileEndpoints.infrastructureMobileVersions),
      ).thenAnswer(
        (_) async => {
          'ios': {
            'effectiveVersion': ' 1.4.0 ',
            'minimumVersion': '',
            'storeUrl': 'https://apps.apple.com/app/id1',
          },
          'android': {
            'effectiveVersion': null,
            'minimumVersion': '1.2.0',
            'storeUrl':
                'https://play.google.com/store/apps/details?id=example.app',
          },
        },
      );

      final repository = MobileVersionPolicyRepository(apiClient: apiClient);
      final result = await repository.getPolicies();

      expect(
        result,
        const MobileVersionPolicies(
          ios: MobilePlatformVersionPolicy(
            effectiveVersion: '1.4.0',
            minimumVersion: null,
            storeUrl: 'https://apps.apple.com/app/id1',
          ),
          android: MobilePlatformVersionPolicy(
            effectiveVersion: null,
            minimumVersion: '1.2.0',
            storeUrl:
                'https://play.google.com/store/apps/details?id=example.app',
          ),
        ),
      );
    });

    test(
      'sends normalized data and unwraps the PUT response payload',
      () async {
        const policies = MobileVersionPolicies(
          ios: MobilePlatformVersionPolicy(
            effectiveVersion: ' 1.5.0 ',
            minimumVersion: ' 1.3.0 ',
            storeUrl: ' https://apps.apple.com/app/id1 ',
          ),
          android: MobilePlatformVersionPolicy(),
        );

        when(
          () => apiClient.putJson(
            MobileEndpoints.infrastructureMobileVersions,
            {
              'ios': {
                'effectiveVersion': '1.5.0',
                'minimumVersion': '1.3.0',
                'storeUrl': 'https://apps.apple.com/app/id1',
              },
              'android': {
                'effectiveVersion': null,
                'minimumVersion': null,
                'storeUrl': null,
              },
            },
          ),
        ).thenAnswer(
          (_) async => {
            'message': 'success',
            'data': {
              'ios': {
                'effectiveVersion': '1.5.0',
                'minimumVersion': '1.3.0',
                'storeUrl': 'https://apps.apple.com/app/id1',
              },
              'android': {
                'effectiveVersion': null,
                'minimumVersion': null,
                'storeUrl': null,
              },
            },
          },
        );

        final repository = MobileVersionPolicyRepository(apiClient: apiClient);
        final result = await repository.updatePolicies(policies);

        expect(result, policies.normalized());
      },
    );
  });
}
