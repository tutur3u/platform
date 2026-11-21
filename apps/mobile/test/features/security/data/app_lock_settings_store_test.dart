import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/security/data/app_lock_settings_store.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _SecureStorage extends Mock implements FlutterSecureStorage {}

class _Prefs extends Mock implements SharedPreferences {}

void main() {
  late _SecureStorage secure;
  late SecureStorageAppLockSettingsStore store;

  setUp(() {
    SharedPreferences.setMockInitialValues({});
    secure = _SecureStorage();
    store = SecureStorageAppLockSettingsStore(secureStorage: secure);
  });

  test('an unreadable keychain falls back to the last known opt-in', () async {
    when(
      () => secure.read(key: 'app-lock-enabled'),
    ).thenAnswer((_) async => 'true');
    expect(await store.isEnabled(), isTrue);
    await Future<void>.delayed(Duration.zero);

    when(
      () => secure.read(key: 'app-lock-enabled'),
    ).thenThrow(StateError('keychain'));
    expect(await store.isEnabled(), isTrue);
  });

  test('a stalled preferences refresh never delays the secure answer', () {
    final stalled = SecureStorageAppLockSettingsStore(
      secureStorage: secure,
      preferences: () => Completer<SharedPreferences>().future,
    );
    when(
      () => secure.read(key: 'app-lock-enabled'),
    ).thenAnswer((_) async => 'false');
    return expectLater(
      stalled.isEnabled().timeout(const Duration(milliseconds: 200)),
      completion(isFalse),
    );
  });

  test('turning App Lock on records the hint', () async {
    when(
      () => secure.write(key: 'app-lock-enabled', value: 'true'),
    ).thenAnswer((_) async {});
    await store.setEnabled(enabled: true);
    when(
      () => secure.read(key: 'app-lock-enabled'),
    ).thenThrow(StateError('keychain'));
    expect(await store.isEnabled(), isTrue);
  });

  test('without a hint an unreadable keychain still reports failure', () async {
    when(
      () => secure.read(key: 'app-lock-enabled'),
    ).thenThrow(StateError('keychain'));
    await expectLater(store.isEnabled(), throwsStateError);
  });

  test('a change that cannot record its fallback is not saved', () async {
    final prefs = _Prefs();
    when(() => prefs.setBool(any(), any())).thenAnswer((_) async => false);
    final failing = SecureStorageAppLockSettingsStore(
      secureStorage: secure,
      preferences: () async => prefs,
    );
    await expectLater(failing.setEnabled(enabled: true), throwsStateError);
    verifyNever(
      () => secure.write(
        key: any(named: 'key'),
        value: any(named: 'value'),
      ),
    );
  });

  test('a failed disable leaves the fallback on', () async {
    when(
      () => secure.write(key: 'app-lock-enabled', value: 'true'),
    ).thenAnswer((_) async {});
    await store.setEnabled(enabled: true);
    when(
      () => secure.write(key: 'app-lock-enabled', value: 'false'),
    ).thenThrow(StateError('keychain'));
    await expectLater(store.setEnabled(enabled: false), throwsStateError);
    when(
      () => secure.read(key: 'app-lock-enabled'),
    ).thenThrow(StateError('keychain'));
    expect(await store.isEnabled(), isTrue);
  });

  test('a preferences failure never overrides the secure setting', () async {
    final failing = SecureStorageAppLockSettingsStore(
      secureStorage: secure,
      preferences: () async => throw StateError('prefs'),
    );
    when(
      () => secure.read(key: 'app-lock-enabled'),
    ).thenAnswer((_) async => 'false');
    expect(await failing.isEnabled(), isFalse);
    when(
      () => secure.read(key: 'app-lock-enabled'),
    ).thenThrow(StateError('keychain'));
    await expectLater(failing.isEnabled(), throwsStateError);
  });

  test('turning App Lock off succeeds once the secure write lands', () async {
    final prefs = _Prefs();
    when(() => prefs.setBool(any(), any())).thenThrow(StateError('prefs'));
    when(
      () => secure.write(key: 'app-lock-enabled', value: 'false'),
    ).thenAnswer((_) async {});
    final failing = SecureStorageAppLockSettingsStore(
      secureStorage: secure,
      preferences: () async => prefs,
    );
    await failing.setEnabled(enabled: false);
    verify(() => secure.write(key: 'app-lock-enabled', value: 'false'));
  });
}
