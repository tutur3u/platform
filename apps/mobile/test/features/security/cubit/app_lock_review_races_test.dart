import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/cubit/app_lock_cubit.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mobile/features/security/data/local_auth_service.dart';
import 'package:mocktail/mocktail.dart';

class _Auth extends Mock implements LocalAuthService {}

class _Store extends Mock implements AppLockSettingsStore {}

void main() {
  test('reload cannot overlap a held OS unlock prompt', () async {
    final auth = _Auth();
    final store = _Store();
    final held = Completer<bool>();
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => AppLockDelay.after30Seconds);
    when(
      () => auth.authenticate(reason: 'Unlock'),
    ).thenAnswer((_) => held.future);
    final cubit = AppLockCubit(localAuthService: auth, settingsStore: store);
    await cubit.load(lockIfEnabled: true);
    final oldPrompt = cubit.unlock(reason: 'Unlock');
    await cubit.load(lockIfEnabled: true);
    final secondPrompt = cubit.unlock(reason: 'Unlock');
    // Release held calls before assertions to keep regression failures finite.
    held.complete(false);
    expect(await oldPrompt, isFalse);
    expect(await secondPrompt, isFalse);
    verify(() => auth.authenticate(reason: 'Unlock')).called(1);
    expect(cubit.state.locked, isTrue);
    await cubit.close();
  });

  test(
    'reload cannot start a settings authentication while OS unlock is held',
    () async {
      final auth = _Auth();
      final store = _Store();
      final held = Completer<bool>();
      when(store.isEnabled).thenAnswer((_) async => true);
      when(
        store.readDelay,
      ).thenAnswer((_) async => AppLockDelay.after30Seconds);
      when(
        () => auth.authenticate(reason: any(named: 'reason')),
      ).thenAnswer((_) => held.future);
      when(() => store.setEnabled(enabled: false)).thenAnswer((_) async {});
      final cubit = AppLockCubit(localAuthService: auth, settingsStore: store);
      await cubit.load(lockIfEnabled: true);
      final unlock = cubit.unlock(reason: 'Unlock');
      await cubit.load(lockIfEnabled: true);
      final disable = cubit.setEnabled(enabled: false, reason: 'Change');
      held.complete(false);
      await unlock;
      await disable;
      verify(() => auth.authenticate(reason: any(named: 'reason'))).called(1);
      verifyNever(() => store.setEnabled(enabled: false));
      await cubit.close();
    },
  );

  test(
    'exception releases physical authentication latch for explicit retry',
    () async {
      final auth = _Auth();
      final store = _Store();
      when(store.isEnabled).thenAnswer((_) async => true);
      when(
        store.readDelay,
      ).thenAnswer((_) async => AppLockDelay.after30Seconds);
      when(
        () => auth.authenticate(reason: 'Unlock'),
      ).thenThrow(StateError('Synthetic authentication failure'));
      final cubit = AppLockCubit(localAuthService: auth, settingsStore: store);
      await cubit.load(lockIfEnabled: true);
      await expectLater(cubit.unlock(reason: 'Unlock'), throwsStateError);
      when(
        () => auth.authenticate(reason: 'Unlock'),
      ).thenAnswer((_) async => true);
      expect(await cubit.unlock(reason: 'Unlock'), isTrue);
      expect(cubit.state.locked, isFalse);
      await cubit.close();
    },
  );

  test(
    'older held delay write cannot overwrite newer confirmed intent',
    () async {
      final store = _Store();
      final older = Completer<void>();
      var persisted = AppLockDelay.after30Seconds;
      when(store.isEnabled).thenAnswer((_) async => true);
      when(store.readDelay).thenAnswer((_) async => persisted);
      when(() => store.setDelay(AppLockDelay.immediately)).thenAnswer((
        _,
      ) async {
        await older.future;
        persisted = AppLockDelay.immediately;
      });
      when(() => store.setDelay(AppLockDelay.after5Minutes)).thenAnswer((
        _,
      ) async {
        persisted = AppLockDelay.after5Minutes;
      });
      final cubit = AppLockCubit(
        localAuthService: _Auth(),
        settingsStore: store,
      );
      await cubit.load();
      final oldSave = cubit.setDelay(AppLockDelay.immediately);
      final newSave = cubit.setDelay(AppLockDelay.after5Minutes);
      // Let pending writes start before releasing the oldest write.
      await Future<void>.delayed(Duration.zero);
      older.complete();
      await Future.wait([oldSave, newSave]);
      expect(cubit.state.delay, AppLockDelay.after5Minutes);
      expect(persisted, AppLockDelay.after5Minutes);
      await cubit.close();
    },
  );

  test('failed delay write does not poison the latest queued save', () async {
    final store = _Store();
    final oldWrite = Completer<void>();
    var persisted = AppLockDelay.after30Seconds;
    when(store.isEnabled).thenAnswer((_) async => true);
    when(store.readDelay).thenAnswer((_) async => persisted);
    when(
      () => store.setDelay(AppLockDelay.immediately),
    ).thenAnswer((_) => oldWrite.future);
    when(() => store.setDelay(AppLockDelay.after5Minutes)).thenAnswer((
      _,
    ) async {
      persisted = AppLockDelay.after5Minutes;
    });
    final cubit = AppLockCubit(localAuthService: _Auth(), settingsStore: store);
    await cubit.load();
    final old = cubit.setDelay(AppLockDelay.immediately);
    final rejected = expectLater(old, throwsStateError);
    final latest = cubit.setDelay(AppLockDelay.after5Minutes);
    await Future<void>.delayed(Duration.zero);
    oldWrite.completeError(StateError('Synthetic write failure'));
    await rejected;
    await latest;
    expect(cubit.state.delay, AppLockDelay.after5Minutes);
    expect(persisted, AppLockDelay.after5Minutes);
    await cubit.close();
  });

  for (final departure in ['reset', 'close']) {
    test('queued delay write is not admitted after $departure', () async {
      final store = _Store();
      final oldWrite = Completer<void>();
      when(store.isEnabled).thenAnswer((_) async => true);
      when(
        store.readDelay,
      ).thenAnswer((_) async => AppLockDelay.after30Seconds);
      when(
        () => store.setDelay(AppLockDelay.immediately),
      ).thenAnswer((_) => oldWrite.future);
      when(
        () => store.setDelay(AppLockDelay.after5Minutes),
      ).thenAnswer((_) async {});
      final cubit = AppLockCubit(
        localAuthService: _Auth(),
        settingsStore: store,
      );
      await cubit.load();
      final old = cubit.setDelay(AppLockDelay.immediately);
      await Future<void>.delayed(Duration.zero);
      final queued = cubit.setDelay(AppLockDelay.after5Minutes);
      if (departure == 'close') {
        await cubit.close();
      } else {
        cubit.resetLockState();
        await cubit.load(lockIfEnabled: true);
      }
      oldWrite.complete();
      await Future.wait([old, queued]);
      verifyNever(() => store.setDelay(AppLockDelay.after5Minutes));
      if (!cubit.isClosed) {
        expect(cubit.state.delay, AppLockDelay.after30Seconds);
        expect(cubit.state.locked, isTrue);
        await cubit.close();
      }
    });
  }

  for (final departure in ['lock', 'reset', 'close']) {
    test(
      'held delay save handles $departure without crossing lifetime',
      () async {
        final store = _Store();
        final held = Completer<void>();
        when(store.isEnabled).thenAnswer((_) async => true);
        when(
          store.readDelay,
        ).thenAnswer((_) async => AppLockDelay.after30Seconds);
        when(
          () => store.setDelay(AppLockDelay.immediately),
        ).thenAnswer((_) => held.future);
        final cubit = AppLockCubit(
          localAuthService: _Auth(),
          settingsStore: store,
        );
        await cubit.load();
        final save = cubit.setDelay(AppLockDelay.immediately);
        await Future<void>.delayed(Duration.zero);
        switch (departure) {
          case 'lock':
            cubit.lock();
          case 'reset':
            cubit.resetLockState();
            await cubit.load(lockIfEnabled: true);
          case 'close':
            await cubit.close();
        }
        held.complete();
        await save;
        if (!cubit.isClosed) {
          expect(
            cubit.state.delay,
            departure == 'lock'
                ? AppLockDelay.immediately
                : AppLockDelay.after30Seconds,
          );
          expect(cubit.state.locked, isTrue);
          await cubit.close();
        }
      },
    );
  }
}
