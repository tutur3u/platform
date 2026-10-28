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
    final legacy = await _takeLegacy(key);
    return secure ?? legacy;
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

  /// Returns and deletes the verifier an older version left in plaintext.
  Future<String?> _takeLegacy(String key) async {
    try {
      final preferences = await _preferences();
      final value = preferences.getString(key);
      if (value != null) await preferences.remove(key);
      return value;
    } on Object catch (error) {
      developer.log(
        'Legacy PKCE cleanup failed: ${error.runtimeType}',
        name: 'SecurePkceStorage',
      );
      return null;
    }
  }
}
