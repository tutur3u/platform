import 'dart:developer' as developer;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/data/sources/secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Stores the OAuth PKCE `code_verifier` in secure storage.
///
/// supabase_flutter defaults to SharedPreferences, which is plaintext and
/// included in Android backups. Verifiers written there by earlier app
/// versions are still honored once, then removed.
class SecurePkceStorage extends GotrueAsyncStorage {
  SecurePkceStorage({
    FlutterSecureStorage? storage,
    Future<SharedPreferences> Function()? preferences,
  }) : _storage = storage ?? authSecureStorage,
       _preferences = preferences ?? SharedPreferences.getInstance;

  final FlutterSecureStorage _storage;
  final Future<SharedPreferences> Function() _preferences;

  @override
  Future<String?> getItem({required String key}) async {
    final secure = await _storage.read(key: key);
    if (secure != null) {
      await _takeLegacy(key);
      return secure;
    }
    return await _migrateLegacy(key);
  }

  @override
  Future<void> setItem({required String key, required String value}) async {
    await _storage.write(key: key, value: value);
    await _takeLegacy(key);
  }

  @override
  Future<void> removeItem({required String key}) async {
    await _storage.delete(key: key);
    await _takeLegacy(key);
  }

  /// Moves a verifier an older version left in plaintext into secure storage,
  /// removing the plaintext copy only once the secure write succeeded so a
  /// failed first code exchange can retry. If the secure write fails the
  /// plaintext copy stays and is still returned for this exchange.
  Future<String?> _migrateLegacy(String key) async {
    final String? value;
    final SharedPreferences preferences;
    try {
      preferences = await _preferences();
      value = preferences.getString(key);
      if (value == null) return null;
    } on Object catch (error) {
      _logFailure('read', error);
      return null;
    }
    try {
      await _storage.write(key: key, value: value);
      await preferences.remove(key);
    } on Object catch (error) {
      _logFailure('migration', error);
    }
    return value;
  }

  /// Deletes the verifier an older version left in plaintext.
  Future<void> _takeLegacy(String key) async {
    try {
      final preferences = await _preferences();
      if (preferences.containsKey(key)) await preferences.remove(key);
    } on Object catch (error) {
      _logFailure('cleanup', error);
    }
  }

  void _logFailure(String step, Object error) => developer.log(
    'Legacy PKCE $step failed: ${error.runtimeType}',
    name: 'SecurePkceStorage',
  );
}
