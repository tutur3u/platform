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

/// Moves auth items written under the old `unlocked` keychain class to
/// [authKeychainOptions].
///
/// The keychain filters reads by accessibility class (older plugin versions
/// strictly), so items written before the hardening are invisible to
/// [authSecureStorage]. Each item is therefore read through [legacy], deleted,
/// and re-written through [current]. If the re-write fails the original is
/// restored so the user is never signed out by the migration. The marker is
/// only written when every key succeeded, so a locked device (old class is
/// unreadable) retries on the next launch.
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
      final value = await legacy.read(key: key);
      if (value == null) continue;
      await legacy.delete(key: key);
      try {
        await current.write(key: key, value: value);
      } on Object {
        await legacy.write(key: key, value: value);
        rethrow;
      }
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

void _log(String message) =>
    developer.log(message, name: 'KeychainAccessibilityMigration');
