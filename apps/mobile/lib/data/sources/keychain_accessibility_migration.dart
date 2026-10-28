import 'dart:developer' as developer;
import 'dart:io' show Platform;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/core/constants/storage_keys.dart';
import 'package:mobile/data/sources/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Secure-storage keys holding refresh tokens that must be device-bound.
const List<String> authSecureStorageKeys = [
  supabasePersistSessionKey,
  StorageKeys.multiAccountStore,
];

/// Set once every auth key has been re-written with [authKeychainOptions].
const keychainMigrationMarkerKey = 'keychain-first-unlock-this-device-v1';

/// Staging key a value is parked under, in the new class, while its old item
/// is replaced. See [migrateAuthKeychainAccessibility].
String keychainMigrationStagingKey(String key) => '$key.migrating';

/// Moves auth items written under the old `unlocked` keychain class to
/// [authKeychainOptions].
///
/// The keychain filters reads by accessibility class (older plugin versions
/// strictly), so items written before the hardening are invisible to
/// [authSecureStorage]. The old item has to be deleted before the new one is
/// written: `flutter_secure_storage_darwin` answers a new-class write over an
/// existing old-class item with `errSecDuplicateItem`, and delete ignores the
/// class. To survive a kill between those two calls, each value is first
/// copied to [keychainMigrationStagingKey] under the new class, and only
/// removed once the real key is back:
///
/// 1. read the old item through [legacy] and stage it through [current];
/// 2. delete the old item;
/// 3. write the real key through [current];
/// 4. delete the staged copy.
///
/// Every run starts by recovering a staged copy left by an interrupted run: if
/// the real key is missing it is restored from staging, otherwise (the user
/// signed in again meanwhile) the staged copy is stale and just dropped. If the
/// re-write fails the original is restored so the user is never signed out by
/// the migration. The marker is only written when every key succeeded, so a
/// locked device (old class is unreadable) retries on the next launch.
///
/// No-op off iOS: [IOSOptions] are ignored by every other platform.
Future<bool> migrateAuthKeychainAccessibility({
  FlutterSecureStorage current = authSecureStorage,
  FlutterSecureStorage legacy = legacyAuthSecureStorage,
  Iterable<String> keys = authSecureStorageKeys,
  bool? enabled,
}) async {
  if (!(enabled ?? Platform.isIOS)) return false;
  try {
    if (await current.read(key: keychainMigrationMarkerKey) != null) {
      return false;
    }
  } on Object catch (error) {
    _log('Keychain migration marker unreadable: ${error.runtimeType}');
    return false;
  }

  var complete = true;
  for (final key in keys) {
    try {
      await _recoverStaged(current: current, legacy: legacy, key: key);
    } on Object catch (error) {
      complete = false;
      _log('Keychain recovery failed for "$key": ${error.runtimeType}');
    }
  }

  for (final key in keys) {
    try {
      final value = await legacy.read(key: key);
      if (value == null) continue;
      final staging = keychainMigrationStagingKey(key);
      await current.write(key: staging, value: value);
      await legacy.delete(key: key);
      try {
        await current.write(key: key, value: value);
      } on Object {
        await legacy.write(key: key, value: value);
        await current.delete(key: staging);
        rethrow;
      }
      await current.delete(key: staging);
    } on Object catch (error) {
      complete = false;
      _log('Keychain migration failed for "$key": ${error.runtimeType}');
    }
  }

  if (!complete) return false;
  try {
    await current.write(key: keychainMigrationMarkerKey, value: '1');
  } on Object catch (error) {
    _log('Keychain migration marker not saved: ${error.runtimeType}');
    return false;
  }
  return true;
}

/// Finishes or discards a staged copy an interrupted run left behind.
Future<void> _recoverStaged({
  required FlutterSecureStorage current,
  required FlutterSecureStorage legacy,
  required String key,
}) async {
  final staging = keychainMigrationStagingKey(key);
  final staged = await current.read(key: staging);
  if (staged == null) return;

  if (await current.read(key: key) == null) {
    // Killed after the old item was copied but possibly before it was deleted;
    // a leftover old item would make the new-class write a duplicate.
    await legacy.delete(key: key);
    await current.write(key: key, value: staged);
  }
  await current.delete(key: staging);
}

void _log(String message) =>
    developer.log(message, name: 'KeychainAccessibilityMigration');
