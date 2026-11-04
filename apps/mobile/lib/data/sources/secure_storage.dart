import 'dart:developer' as developer;

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

  Future<void> _pending = Future<void>.value();

  Future<T> _serial<T>(Future<T> Function() operation) {
    final result = _pending.then((_) => operation());
    _pending = result.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return result;
  }

  @override
  Future<String?> accessToken() => _serial(() async {
    final staged = await _storage.read(key: _retryKey);
    if (staged == null) {
      return await _storage.read(key: supabasePersistSessionKey);
    }
    try {
      await _storage.write(key: supabasePersistSessionKey, value: staged);
      await _storage.delete(key: _retryKey);
    } on Object catch (error) {
      developer.log(
        'Session recovery promotion failed: ${error.runtimeType}',
        name: 'SupabaseSecureStorage',
      );
    }
    return staged;
  });

  @override
  Future<bool> hasAccessToken() async {
    return await _storage.read(key: _retryKey) != null ||
        await _storage.read(key: supabasePersistSessionKey) != null;
  }

  @override
  Future<void> persistSession(String persistSessionString) => _serial(() async {
    // A copy left staged by an earlier failed retry wins the next read, so
    // replace it first; it can then never hold an older token than the primary.
    if (await _storage.read(key: _retryKey) != null) {
      await _storage.write(key: _retryKey, value: persistSessionString);
    }
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
    }
    try {
      await _storage.delete(key: _retryKey);
    } on Object catch (error) {
      // The staged copy now matches the primary, so leaving it is harmless.
      developer.log(
        'Session staging cleanup failed: ${error.runtimeType}',
        name: 'SupabaseSecureStorage',
      );
    }
  });

  @override
  Future<void> removePersistedSession() => _serial(() async {
    await _storage.delete(key: _retryKey);
    await _storage.delete(key: supabasePersistSessionKey);
  });
}
