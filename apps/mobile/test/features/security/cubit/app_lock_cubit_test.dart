import 'package:bloc_test/bloc_test.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mocktail/mocktail.dart';

class _MockLocalAuthService extends Mock implements LocalAuthService {}

class _MockAppLockSettingsStore extends Mock implements AppLockSettingsStore {}

void main() {
  group('AppLockCubit', () {
    late _MockLocalAuthService localAuthService;
    late _MockAppLockSettingsStore settingsStore;

    setUp(() {
      localAuthService = _MockLocalAuthService();
      settingsStore = _MockAppLockSettingsStore();
      when(settingsStore.isEnabled).thenAnswer((_) async => false);
      when(
        () => settingsStore.setEnabled(enabled: any(named: 'enabled')),
      ).thenAnswer((_) async {});
      when(localAuthService.isDeviceSupported).thenAnswer((_) async => true);
      when(
        () => localAuthService.authenticate(reason: any(named: 'reason')),
      ).thenAnswer((_) async => true);
    });

    AppLockCubit buildCubit() => AppLockCubit(
      localAuthService: localAuthService,
      settingsStore: settingsStore,
    );

    blocTest<AppLockCubit, AppLockState>(
      'loads persisted lock setting',
      setUp: () {
        when(settingsStore.isEnabled).thenAnswer((_) async => true);
      },
      build: buildCubit,
      act: (cubit) => cubit.load(),
      expect: () => [
        const AppLockState(status: AppLockStatus.loading),
        const AppLockState(enabled: true, hasLoaded: true),
      ],
    );

    blocTest<AppLockCubit, AppLockState>(
      'locks authenticated startup after persisted lock setting loads',
      setUp: () {
        when(settingsStore.isEnabled).thenAnswer((_) async => true);
      },
      build: buildCubit,
      act: (cubit) => cubit.load(lockIfEnabled: true),
      expect: () => [
        const AppLockState(status: AppLockStatus.loading),
        const AppLockState(enabled: true, locked: true, hasLoaded: true),
      ],
    );

    blocTest<AppLockCubit, AppLockState>(
      'enables lock only after local authentication succeeds',
      build: buildCubit,
      act: (cubit) =>
          cubit.setEnabled(enabled: true, reason: 'Enable app lock'),
      expect: () => [
        const AppLockState(status: AppLockStatus.authenticating),
        const AppLockState(enabled: true, hasLoaded: true),
      ],
      verify: (_) {
        verify(
          () => localAuthService.authenticate(reason: 'Enable app lock'),
        ).called(1);
        verify(() => settingsStore.setEnabled(enabled: true)).called(1);
      },
    );

    blocTest<AppLockCubit, AppLockState>(
      'blocks QR approval when app lock is disabled',
      seed: () => const AppLockState(hasLoaded: true),
      build: buildCubit,
      act: (cubit) async {
        final approved = await cubit.authenticateForQrLogin(
          reason: 'Approve web login',
        );
        expect(approved, isFalse);
      },
      expect: () => const <AppLockState>[],
    );
  });
}
