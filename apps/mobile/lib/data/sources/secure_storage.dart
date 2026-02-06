import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Secure storage adapter that bridges [FlutterSecureStorage] with
/// Supabase's [LocalStorage] interface for persisting auth tokens.
///
/// iOS: Keychain Services
/// Android: Keystore (encrypted shared preferences)
class SupabaseSecureStorage extends LocalStorage {
  SupabaseSecureStorage()
      : _storage = const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
        );

  final FlutterSecureStorage _storage;

  @override
  Future<void> initialize() async {}

  @override
  Future<String?> accessToken() async {
    return _storage.read(key: supabasePersistSessionKey);
  }

  @override
  Future<bool> hasAccessToken() async {
    return await _storage.containsKey(key: supabasePersistSessionKey);
  }

  @override
  Future<void> persistSession(String persistSessionString) async {
    await _storage.write(
      key: supabasePersistSessionKey,
      value: persistSessionString,
    );
  }

  @override
  Future<void> removePersistedSession() async {
    await _storage.delete(key: supabasePersistSessionKey);
  }
}
