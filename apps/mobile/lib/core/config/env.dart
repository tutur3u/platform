/// Environment configuration for the app.
///
/// Uses `--dart-define` flags passed at build time to configure
/// Supabase URLs and API base URLs per flavor.
class Env {
  const Env._();

  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'http://localhost:54321',
  );

  static const supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
  );

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:7803',
  );

  static bool get isConfigured =>
      supabaseAnonKey.isNotEmpty && supabaseUrl.isNotEmpty;
}
