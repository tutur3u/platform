import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/data/sources/secure_storage.dart';

final deviceSecureStorage = DeviceSecureStorage();

/// Lazily moves each iOS item from unlocked to first_unlock_this_device.
/// A durable strong-class stage survives deletion of the old item.
/// Per-key serialization prevents reads from resurrecting deleted items.
class DeviceSecureStorage extends FlutterSecureStorage {
  DeviceSecureStorage({
    FlutterSecureStorage? current,
    FlutterSecureStorage? legacy,
    bool? migrateIOS,
  }) : _current = current ?? authSecureStorage,
       _legacy = legacy ?? legacyAuthSecureStorage,
       _migrateIOS = migrateIOS ?? Platform.isIOS;

  final FlutterSecureStorage _current;
  final FlutterSecureStorage _legacy;
  final bool _migrateIOS;
  final _pending = <String, Future<void>>{};

  Future<T> _serial<T>(String key, Future<T> Function() operation) async {
    final previous = _pending[key] ?? Future<void>.value();
    final result = previous.then((_) => operation());
    final settled = result.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    _pending[key] = settled;
    try {
      return await result;
    } finally {
      if (identical(_pending[key], settled)) {
        unawaited(_pending.remove(key));
      }
    }
  }

  String _stage(String key) => '$key.device-class-migration-v1';

  Future<String?> _read(String key) async {
    final current = await _current.read(key: key);
    if (!_migrateIOS) return current;
    final stage = _stage(key);
    if (current != null) {
      await _current.delete(key: stage);
      return current;
    }
    final value =
        await _current.read(key: stage) ?? await _legacy.read(key: key);
    if (value == null) return null;
    await _current.write(key: stage, value: value);
    await _legacy.delete(key: key);
    await _current.write(key: key, value: value);
    await _current.delete(key: stage);
    return value;
  }

  @override
  Future<Map<String, String>> readAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => throw UnsupportedError('Device storage requires explicit keys');

  @override
  Future<void> deleteAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => throw UnsupportedError('Device storage requires explicit keys');

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) => _serial(key, () async {
    return await _read(key);
  });

  @override
  Future<bool> containsKey({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) => _serial(key, () async {
    return await _read(key) != null;
  });

  @override
  Future<void> write({
    required String key,
    required String? value,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) => _serial(key, () async {
    if (value == null) {
      if (_migrateIOS) await _current.delete(key: _stage(key));
      await _current.delete(key: key);
      return;
    }
    await _read(key);
    await _current.write(key: key, value: value);
  });

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) => _serial(key, () async {
    if (_migrateIOS) await _current.delete(key: _stage(key));
    await _current.delete(key: key);
  });
}
