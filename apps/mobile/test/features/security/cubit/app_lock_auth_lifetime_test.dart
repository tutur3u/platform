import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mocktail/mocktail.dart';

class _Auth extends Mock implements LocalAuthService {}

class _Store extends Mock implements AppLockSettingsStore {}

void main() {
  test('duplicate unlock cannot start overlapping OS prompts', () async {
    final auth = _Auth();
    final store = _Store();
    final held = Completer<bool>();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
    when(
      () => auth.authenticate(reason: 'Unlock'),
    ).thenAnswer((_) => held.future);
    final cubit = AppLockCubit(localAuthService: auth, settingsStore: store);
    await cubit.load(lockIfEnabled: true);
    final pending = cubit.unlock(reason: 'Unlock');
    expect(await cubit.unlock(reason: 'Unlock'), isFalse);
    held.complete(false);
    expect(await pending, isFalse);
    expect(cubit.state.locked, isTrue);
    verify(() => auth.authenticate(reason: 'Unlock')).called(1);
    await cubit.close();
  });

  test('current successful OS authentication unlocks', () async {
    final auth = _Auth();
    final store = _Store();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
    when(
      () => auth.authenticate(reason: 'Unlock'),
    ).thenAnswer((_) async => true);
    final cubit = AppLockCubit(localAuthService: auth, settingsStore: store);
    await cubit.load(lockIfEnabled: true);
    expect(await cubit.unlock(reason: 'Unlock'), isTrue);
    expect(cubit.state.locked, isFalse);
    await cubit.close();
  });

  for (final departure in ['reset and relock', 'close']) {
    test('held authentication cannot unlock after $departure', () async {
      final auth = _Auth();
      final store = _Store();
      final held = Completer<bool>();
      when(store.isEnabled).thenAnswer((_) async => true);
      when(store.readDelay).thenAnswer((_) async => AppLockDelay.immediately);
      when(
        () => auth.authenticate(reason: 'Unlock'),
      ).thenAnswer((_) => held.future);
      final cubit = AppLockCubit(localAuthService: auth, settingsStore: store);
      await cubit.load(lockIfEnabled: true);
      final pending = cubit.unlock(reason: 'Unlock');
      if (departure == 'close') {
        await cubit.close();
      } else {
        cubit.resetLockState();
        await cubit.load(lockIfEnabled: true);
      }
      held.complete(true);
      expect(await pending, isFalse);
      if (!cubit.isClosed) {
        expect(cubit.state.locked, isTrue);
        await cubit.close();
      }
    });
  }
}
