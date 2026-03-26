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

  static const googleWebClientId = String.fromEnvironment(
    'GOOGLE_WEB_CLIENT_ID',
    defaultValue:
        '21140998358-'
        'islbgrnrvoqipmghnb3rq5cjg23rvr9m.apps.googleusercontent.com',
  );

  static const googleIosClientId = String.fromEnvironment(
    'GOOGLE_IOS_CLIENT_ID',
    // Let google_sign_in load the flavor-matched iOS client from the bundled
    // GoogleService-Info.plist unless a value is explicitly injected.
    defaultValue: '',
  );

  static const isTaskDescriptionEditingEnabled = bool.fromEnvironment(
    'MOBILE_TASK_DESCRIPTION_EDITING_ENABLED',
  );

  static const isCalendarIntegrationsEnabled = bool.fromEnvironment(
    'MOBILE_CALENDAR_INTEGRATIONS_ENABLED',
  );

  static bool get isTurnstileConfigured =>
      turnstileSiteKey.isNotEmpty && turnstileBaseUrl.isNotEmpty;

  static bool get isConfigured =>
      supabaseAnonKey.isNotEmpty && supabaseUrl.isNotEmpty;

  static bool get isDevelopment => apiBaseUrl.contains('localhost');
}
