import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/mobile_version_check.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/repositories/version_check_repository.dart';
import 'package:mobile/features/app_version/cubit/app_version_cubit.dart';
import 'package:mobile/features/app_version/cubit/app_version_state.dart';
import 'package:mocktail/mocktail.dart';

class _MockVersionCheckRepository extends Mock
    implements VersionCheckRepository {}

class _MockSettingsRepository extends Mock implements SettingsRepository {}

void main() {
  group('AppVersionCubit', () {
    late _MockVersionCheckRepository versionCheckRepository;
    late _MockSettingsRepository settingsRepository;

    setUp(() {
      versionCheckRepository = _MockVersionCheckRepository();
      settingsRepository = _MockSettingsRepository();
    });

    test(
      'suppresses the recommended prompt when the version was dismissed',
      () async {
        when(
          () => versionCheckRepository.checkCurrentVersion(),
        ).thenAnswer(
          (_) async => const MobileVersionCheck(
            platform: 'ios',
            currentVersion: '1.2.0',
            effectiveVersion: '1.3.0',
            minimumVersion: '1.1.0',
            storeUrl: 'https://apps.apple.com/app/id1',
            status: MobileUpdateStatus.updateRecommended,
            shouldUpdate: true,
            requiresUpdate: false,
          ),
        );
        when(
          () => settingsRepository.getDismissedRecommendedVersion('ios'),
        ).thenAnswer((_) async => '1.3.0');

        final cubit = AppVersionCubit(
          versionCheckRepository: versionCheckRepository,
          settingsRepository: settingsRepository,
        );

        await cubit.checkVersion();

        expect(cubit.state.status, AppVersionGateStatus.updateRecommended);
        expect(cubit.state.shouldShowRecommendedPrompt, isFalse);
      },
    );

    test('persists the dismissed effective version', () async {
      when(
        () => versionCheckRepository.checkCurrentVersion(),
      ).thenAnswer(
        (_) async => const MobileVersionCheck(
          platform: 'android',
          currentVersion: '1.2.0',
          effectiveVersion: '1.4.0',
          minimumVersion: '1.1.0',
          storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
          status: MobileUpdateStatus.updateRecommended,
          shouldUpdate: true,
          requiresUpdate: false,
        ),
      );
      when(
        () => settingsRepository.getDismissedRecommendedVersion('android'),
      ).thenAnswer((_) async => null);
      when(
        () => settingsRepository.setDismissedRecommendedVersion(
          'android',
          '1.4.0',
        ),
      ).thenAnswer((_) async {});

      final cubit = AppVersionCubit(
        versionCheckRepository: versionCheckRepository,
        settingsRepository: settingsRepository,
      );

      await cubit.checkVersion();

      await cubit.dismissRecommendedPrompt();

      verify(
        () => settingsRepository.setDismissedRecommendedVersion(
          'android',
          '1.4.0',
        ),
      ).called(1);
      expect(cubit.state.shouldShowRecommendedPrompt, isFalse);
    });
  });
}
