import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Keychain class for auth secrets (refresh tokens, PKCE verifier).
///
/// `first_unlock_this_device` stays readable by background refresh and push
/// after the first unlock, but is excluded from iTunes/Finder and iCloud
/// backups and never restored onto another device.
const authKeychainOptions = IOSOptions(
  accessibility: KeychainAccessibility.first_unlock_this_device,
);

/// Shared secure storage for every auth secret in the app.
const authSecureStorage = FlutterSecureStorage(iOptions: authKeychainOptions);

/// Pre-hardening storage using the plugin's default (`unlocked`, backed up)
/// keychain class. Only `migrateAuthKeychainAccessibility` should touch it.
const legacyAuthSecureStorage = FlutterSecureStorage();

/// Secure storage adapter that bridges [FlutterSecureStorage] with
/// Supabase's [LocalStorage] interface for persisting auth tokens.
///
/// iOS: Keychain Services
/// Android: Keystore (encrypted shared preferences)
class SupabaseSecureStorage extends LocalStorage {
  SupabaseSecureStorage({FlutterSecureStorage? storage})
    : _storage = storage ?? authSecureStorage;

  final FlutterSecureStorage _storage;

  String get _retryKey => '$supabasePersistSessionKey.persist-retry';

  @override
  Future<void> initialize() async {}

  @override
  Future<String?> accessToken() async {
    final primary = await _storage.read(key: supabasePersistSessionKey);
    if (primary != null) {
      await _storage.delete(key: _retryKey);
      return primary;
    }
    final staged = await _storage.read(key: _retryKey);
    if (staged == null) return null;
    await _storage.delete(key: supabasePersistSessionKey);
    await _storage.write(key: supabasePersistSessionKey, value: staged);
    await _storage.delete(key: _retryKey);
    return staged;
  }

  @override
  Future<bool> hasAccessToken() async {
    return await accessToken() != null;
  }

  @override
  Future<void> persistSession(String persistSessionString) async {
    try {
      await _storage.write(
        key: supabasePersistSessionKey,
        value: persistSessionString,
      );
    } on PlatformException catch (error) {
      if (error.details != -25299 && error.code != '-25299') rethrow;
      // Preserve the rotated token durably before deleting the invisible item.
      await _storage.write(key: _retryKey, value: persistSessionString);
      await _storage.delete(key: supabasePersistSessionKey);
      await _storage.write(
        key: supabasePersistSessionKey,
        value: persistSessionString,
      );
      await _storage.delete(key: _retryKey);
    }
  }

  @override
  Future<void> removePersistedSession() async {
    await _storage.delete(key: _retryKey);
    await _storage.delete(key: supabasePersistSessionKey);
  }
}
