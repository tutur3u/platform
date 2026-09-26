import 'package:flutter_secure_storage/flutter_secure_storage.dart';

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
    FlutterSecureStorage secureStorage = const FlutterSecureStorage(),
  }) : _secureStorage = secureStorage;

  static const _enabledKey = 'app-lock-enabled';
  static const _delayKey = 'app-lock-delay';

  final FlutterSecureStorage _secureStorage;

  @override
  Future<bool> isEnabled() async {
    final value = await _secureStorage.read(key: _enabledKey);
    return value == 'true';
  }

  @override
  Future<void> setEnabled({required bool enabled}) async {
    await _secureStorage.write(key: _enabledKey, value: enabled.toString());
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
