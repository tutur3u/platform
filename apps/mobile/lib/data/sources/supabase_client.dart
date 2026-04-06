import 'dart:developer' as developer;
import 'dart:io' show Platform;

import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/sources/secure_storage.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

var _supabaseInitialized = false;

/// Initializes the Supabase client with secure token storage.
///
/// Must be called once in `bootstrap()` before the app starts.
Future<void> initSupabase() async {
  var url = Env.supabaseUrl.replaceAll(RegExp(r'/$'), '');

  // Android emulator maps localhost → 10.0.2.2
  if (Platform.isAndroid && url.contains('localhost')) {
    url = url.replaceAll('localhost', '10.0.2.2');
  }

  developer.log(
    'Initializing Supabase client',
    name: 'SupabaseClient',
    error: {
      'supabaseUrl': url,
      'apiBaseUrl': Env.apiBaseUrl,
      'isConfigured': Env.isConfigured,
    },
  );

  await Supabase.initialize(
    url: url,
    anonKey: Env.supabaseAnonKey,
    authOptions: FlutterAuthClientOptions(
      localStorage: SupabaseSecureStorage(),
    ),
  );
  _supabaseInitialized = true;
}

/// Shorthand accessor for the Supabase client singleton.
SupabaseClient get supabase => Supabase.instance.client;

/// Nullable accessor for contexts where Supabase may not be initialized yet.
SupabaseClient? get maybeSupabase =>
    _supabaseInitialized ? Supabase.instance.client : null;
