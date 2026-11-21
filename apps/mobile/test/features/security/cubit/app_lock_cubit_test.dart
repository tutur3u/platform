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
        settingsStore.readDelay,
      ).thenAnswer((_) async => AppLockDelay.after30Seconds);
      when(
        () => settingsStore.setDelay(AppLockDelay.after5Minutes),
      ).thenAnswer((_) async {});
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

    test('an account change locks before the settings read finishes', () async {
      when(settingsStore.isEnabled).thenAnswer((_) async => true);
      final cubit = buildCubit();
      addTearDown(cubit.close);
      await cubit.load();
      expect(cubit.state.locked, isFalse);

      final pending = cubit.load(lockIfEnabled: true);
      expect(cubit.state.locked, isTrue);
      expect(cubit.state.status, AppLockStatus.loading);
      await pending;
      expect(cubit.state.locked, isTrue);
    });

    test('a failed read keeps the known opt-in and the pending lock', () async {
      when(settingsStore.isEnabled).thenAnswer((_) async => true);
      final cubit = buildCubit();
      addTearDown(cubit.close);
      await cubit.load();
      when(settingsStore.isEnabled).thenThrow(StateError('keychain'));
      await cubit.load(lockIfEnabled: true);
      expect(cubit.state.enabled, isTrue);
      expect(cubit.state.locked, isTrue);
      expect(cubit.state.hasLoaded, isTrue);
    });

    test('a failed delay read keeps a confirmed opt-in', () async {
      when(settingsStore.isEnabled).thenAnswer((_) async => true);
      when(settingsStore.readDelay).thenThrow(StateError('keychain'));
      final cubit = buildCubit();
      addTearDown(cubit.close);
      await cubit.load(lockIfEnabled: true);
      expect(cubit.state.enabled, isTrue);
      expect(cubit.state.locked, isTrue);
      expect(cubit.state.delay, AppLockDelay.after30Seconds);
    });

    test('a failed first read fails closed where unlock is possible', () async {
      when(settingsStore.isEnabled).thenThrow(StateError('keychain'));
      final cubit = buildCubit();
      addTearDown(cubit.close);
      await cubit.load(lockIfEnabled: true);
      expect(cubit.state.hasLoaded, isTrue);
      expect(cubit.state.enabled, isTrue);
      expect(cubit.state.locked, isTrue);
      expect(await cubit.unlock(reason: 'unlock'), isTrue);
      expect(cubit.state.locked, isFalse);
    });

    test('a failed first read stays off where unlock is impossible', () async {
      when(settingsStore.isEnabled).thenThrow(StateError('keychain'));
      when(localAuthService.isDeviceSupported).thenAnswer((_) async => false);
      final cubit = buildCubit();
      addTearDown(cubit.close);
      await cubit.load(lockIfEnabled: true);
      expect(cubit.state.hasLoaded, isTrue);
      expect(cubit.state.enabled, isFalse);
      expect(cubit.state.locked, isFalse);
    });

    test('a setting that cannot be saved reports it', () async {
      when(
        () => settingsStore.setEnabled(enabled: true),
      ).thenThrow(StateError('prefs'));
      final cubit = buildCubit();
      addTearDown(cubit.close);
      await cubit.load();
      await cubit.setEnabled(enabled: true, reason: 'enable');
      expect(cubit.state.enabled, isFalse);
      expect(cubit.state.status, AppLockStatus.unavailable);
      expect(cubit.state.error, isNotNull);
    });

    test('a cancelled unlock reports the failure', () async {
      when(settingsStore.isEnabled).thenAnswer((_) async => true);
      when(
        () => localAuthService.authenticate(reason: any(named: 'reason')),
      ).thenAnswer((_) async => false);
      final cubit = buildCubit();
      addTearDown(cubit.close);
      await cubit.load(lockIfEnabled: true);
      expect(await cubit.unlock(reason: 'unlock'), isFalse);
      expect(cubit.state.locked, isTrue);
      expect(cubit.state.error, isNotNull);
    });

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
      'loads and saves the selected lock delay',
      setUp: () {
        when(settingsStore.isEnabled).thenAnswer((_) async => true);
        when(
          settingsStore.readDelay,
        ).thenAnswer((_) async => AppLockDelay.immediately);
      },
      build: buildCubit,
      act: (cubit) async {
        await cubit.load();
        await cubit.setDelay(AppLockDelay.after5Minutes);
      },
      expect: () => [
        const AppLockState(status: AppLockStatus.loading),
        const AppLockState(
          enabled: true,
          delay: AppLockDelay.immediately,
          hasLoaded: true,
        ),
        const AppLockState(
          enabled: true,
          delay: AppLockDelay.after5Minutes,
          hasLoaded: true,
        ),
      ],
      verify: (_) => verify(
        () => settingsStore.setDelay(AppLockDelay.after5Minutes),
      ).called(1),
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
