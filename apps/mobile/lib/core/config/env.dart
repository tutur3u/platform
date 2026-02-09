/// Environment configuration for the app.
///
/// Uses `--dart-define` flags passed at build time to configure
/// Supabase URLs and API base URLs per flavor.
class Env {
  const Env._();

  static const supabaseUrl = String.fromEnvironment(
    'NEXT_PUBLIC_SUPABASE_URL',
    defaultValue: 'http://localhost:54321',
  );

  static const supabaseAnonKey = String.fromEnvironment(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:7803',
  );

  static const turnstileSiteKey = String.fromEnvironment(
    'TURNSTILE_SITE_KEY',
  );

  /// The domain registered in the Cloudflare Turnstile widget's allowed
  /// domains list. Required for the mobile WebView-based widget to pass
  /// Cloudflare's origin validation.
  static const turnstileBaseUrl = String.fromEnvironment(
    'TURNSTILE_BASE_URL',
  );

  static bool get isTurnstileConfigured =>
      turnstileSiteKey.isNotEmpty && turnstileBaseUrl.isNotEmpty;

  static bool get isConfigured =>
      supabaseAnonKey.isNotEmpty && supabaseUrl.isNotEmpty;
}
