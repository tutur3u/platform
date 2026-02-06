import 'dart:io' show Platform;

import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/sources/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Initializes the Supabase client with secure token storage.
///
/// Must be called once in [bootstrap] before the app starts.
Future<void> initSupabase() async {
  var url = Env.supabaseUrl.replaceAll(RegExp(r'/$'), '');

  // Android emulator maps localhost → 10.0.2.2
  if (Platform.isAndroid && url.contains('localhost')) {
    url = url.replaceAll('localhost', '10.0.2.2');
  }

  await Supabase.initialize(
    url: url,
    anonKey: Env.supabaseAnonKey,
    authOptions: const FlutterAuthClientOptions(
      autoRefreshToken: true,
    ),
    localStorage: SupabaseSecureStorage(),
  );
}

/// Shorthand accessor for the Supabase client singleton.
SupabaseClient get supabase => Supabase.instance.client;
