import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_secret_crypto.dart';

/// Whether [change] reached the Keychain: false when the Keychain refused
/// it, in which case the stored item is exactly as it was.
Future<bool> fleetSecretStored(Future<void> Function() change) async {
  try {
    await change();
    return true;
  } on FleetSecretCryptoException {
    return false;
  }
}

/// Mastermind secret entry's Keychain items (paired-machine pins with their
/// used pairings, and the saved wrong-code counts), through the app's own
/// plugin (`MastermindSecretStore.swift`) instead of the secure-storage
/// plugin.
///
/// The items sit in the service [service], this device only, readable only
/// while unlocked. A write changes an existing item in place and never
/// deletes it: when the Keychain refuses, the old value stays and the call
/// throws [FleetSecretCryptoException] with `keychain`. A refused read
/// throws too, so it is never taken for a missing item. The secure-storage
/// plugin deletes and re-adds an item whose update fails, which would lose
/// a user's pins and used pairings on a failed add.
///
/// It is a [FlutterSecureStorage] so the pin and count stores take it like
/// any other storage; every data method is overridden and none reaches the
/// secure-storage plugin.
class FleetSecretKeychain extends FlutterSecureStorage {
  const FleetSecretKeychain({
    MethodChannel channel = const MethodChannel('mobile/mastermind_secret'),
  }) : _channel = channel;

  /// The Keychain service, matching `MastermindSecretStore.service`.
  static const service = 'tuturuuu.mastermind-secret';

  final MethodChannel _channel;

  Future<T?> _call<T>(String method, [Map<String, Object?>? args]) async {
    try {
      return await _channel.invokeMethod<T>(method, args);
    } on MissingPluginException {
      throw const FleetSecretCryptoException('unsupported');
    } on PlatformException catch (error) {
      throw FleetSecretCryptoException(
        error.code == 'keychain' || error.code == 'bad_arguments'
            ? error.code
            : 'failed',
      );
    }
  }

  @override
  Future<String?> read({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) => _call<String>('storeRead', {'key': key});

  @override
  Future<bool> containsKey({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => await read(key: key) != null;

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
  }) => value == null
      ? delete(key: key)
      : _call<void>('storeWrite', {'key': key, 'value': value});

  @override
  Future<void> delete({
    required String key,
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) => _call<void>('storeDelete', {'key': key});

  @override
  Future<Map<String, String>> readAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async {
    final all = await _call<Map<Object?, Object?>>('storeReadAll');
    // No answer, or one with a row that is not text, is a failure: an erase
    // must never skip an item it was not told about.
    if (all == null) throw const FleetSecretCryptoException('failed');
    final items = <String, String>{};
    for (final MapEntry(:key, :value) in all.entries) {
      if (key is! String || value is! String) {
        throw const FleetSecretCryptoException('failed');
      }
      items[key] = value;
    }
    return items;
  }

  /// The name of every stored item, without reading any value, so an erase
  /// can remove an item whose value cannot be read.
  Future<List<String>> keys() async {
    final names = await _call<List<Object?>>('storeKeys');
    if (names == null) throw const FleetSecretCryptoException('failed');
    final keys = <String>[];
    for (final name in names) {
      if (name is! String) throw const FleetSecretCryptoException('failed');
      keys.add(name);
    }
    return keys;
  }

  /// Items are deleted by name only; the erase lists them first.
  @override
  Future<void> deleteAll({
    AppleOptions? iOptions,
    AndroidOptions? aOptions,
    LinuxOptions? lOptions,
    WebOptions? webOptions,
    AppleOptions? mOptions,
    WindowsOptions? wOptions,
  }) async => throw UnsupportedError('Secret storage deletes named items');
}
