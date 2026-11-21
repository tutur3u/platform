import 'dart:async';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/data/sources/device_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum AppLockDelay {
  immediately(Duration.zero),
  after30Seconds(Duration(seconds: 30)),
  after1Minute(Duration(minutes: 1)),
  after5Minutes(Duration(minutes: 5));

  const AppLockDelay(this.duration);

  final Duration duration;
}

abstract interface class AppLockSettingsStore {
  Future<bool> isEnabled();

  Future<void> setEnabled({required bool enabled});

  Future<AppLockDelay> readDelay();

  Future<void> setDelay(AppLockDelay delay);
}

class SecureStorageAppLockSettingsStore implements AppLockSettingsStore {
  SecureStorageAppLockSettingsStore({
    FlutterSecureStorage? secureStorage,
    Future<SharedPreferences> Function()? preferences,
  }) : _secureStorage = secureStorage ?? deviceSecureStorage,
       _preferences = preferences ?? SharedPreferences.getInstance;

  static const _enabledKey = 'app-lock-enabled';
  static const _delayKey = 'app-lock-delay';

  /// Last opt-in read from secure storage. An unreadable keychain falls back
  /// to it so App Lock fails closed rather than off.
  static const enabledHintKey = 'app-lock-enabled-hint';
  static const _readTimeout = Duration(seconds: 2);

  final FlutterSecureStorage _secureStorage;
  final Future<SharedPreferences> Function() _preferences;

  @override
  Future<bool> isEnabled() async {
    final bool enabled;
    try {
      final value = await _secureStorage
          .read(key: _enabledKey)
          .timeout(_readTimeout);
      enabled = value == 'true';
    } on Object {
      final hint = await _readHint();
      if (hint == null) rethrow;
      return hint;
    }
    // The secure value is authoritative and returns at once; refreshing its
    // record is best effort and never delays or changes the answer.
    unawaited(_refreshHint(enabled));
    return enabled;
  }

  Future<void> _refreshHint(bool enabled) async {
    try {
      final prefs = await _preferences();
      if (prefs.getBool(enabledHintKey) != enabled) {
        await prefs.setBool(enabledHintKey, enabled);
      }
    } on Object catch (_) {}
  }

  Future<bool?> _readHint() async {
    try {
      return (await _preferences()).getBool(enabledHintKey);
    } on Object {
      return null;
    }
  }

  /// Orders the two writes so a failure can only leave App Lock on: turning
  /// it on records the fallback first and fails if that record cannot be
  /// saved; turning it off clears the fallback only after the secure write.
  @override
  Future<void> setEnabled({required bool enabled}) async {
    final prefs = await _preferences();
    if (enabled) {
      if (!await prefs.setBool(enabledHintKey, true)) {
        throw StateError('App Lock preference could not be recorded');
      }
      await _secureStorage.write(key: _enabledKey, value: 'true');
      return;
    }
    await _secureStorage.write(key: _enabledKey, value: 'false');
    // The secure write is the change; a stale fallback only ever locks.
    try {
      await prefs.setBool(enabledHintKey, false);
    } on Object catch (_) {}
  }

  @override
  Future<AppLockDelay> readDelay() async {
    final value = await _secureStorage.read(key: _delayKey);
    return AppLockDelay.values.firstWhere(
      (delay) => delay.name == value,
      orElse: () => AppLockDelay.after30Seconds,
    );
  }

  @override
  Future<void> setDelay(AppLockDelay delay) =>
      _secureStorage.write(key: _delayKey, value: delay.name);
}
