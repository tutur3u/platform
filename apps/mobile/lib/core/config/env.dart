import 'package:mobile/core/config/env_security.dart';

/// Environment configuration for the app.
///
/// Uses `--dart-define` flags passed at build time to configure
/// Supabase URLs and API base URLs per flavor.
///
/// Release builds have no cleartext localhost fallback: an unset URL is empty
/// and [assertSecureForRelease] rejects it at startup.
class Env {
  const Env._();

  static const _isRelease = bool.fromEnvironment('dart.vm.product');

  static const supabaseUrl = String.fromEnvironment(
    'NEXT_PUBLIC_SUPABASE_URL',
    defaultValue: _isRelease ? '' : 'http://localhost:54321',
  );

  static const supabaseAnonKey = String.fromEnvironment(
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  );

  static const meetEditorBaseUrl = String.fromEnvironment(
    'MEET_EDITOR_BASE_URL',
    defaultValue: 'https://meet.tuturuuu.com',
  );

  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: _isRelease ? '' : 'http://localhost:7803',
  );

  static const tasksApiBaseUrl = String.fromEnvironment('TASKS_API_BASE_URL');

  static const financeApiBaseUrl = String.fromEnvironment(
    'FINANCE_API_BASE_URL',
  );

  static const inventoryApiBaseUrl = String.fromEnvironment(
    'INVENTORY_API_BASE_URL',
  );

  static const contactsApiBaseUrl = String.fromEnvironment(
    'CONTACTS_API_BASE_URL',
  );

  static const calendarApiBaseUrl = String.fromEnvironment(
    'CALENDAR_API_BASE_URL',
  );

  static const teachApiBaseUrl = String.fromEnvironment('TEACH_API_BASE_URL');

  static const trackApiBaseUrl = String.fromEnvironment('TRACK_API_BASE_URL');
  static const mailApiBaseUrl = String.fromEnvironment('MAIL_API_BASE_URL');

  static const infrastructureApiBaseUrl = String.fromEnvironment(
    'INFRASTRUCTURE_API_BASE_URL',
  );

  static const turnstileSiteKey = String.fromEnvironment('TURNSTILE_SITE_KEY');

  /// The domain registered in the Cloudflare Turnstile widget's allowed
  /// domains list. Required for the mobile WebView-based widget to pass
  /// Cloudflare's origin validation.
  static const turnstileBaseUrl = String.fromEnvironment('TURNSTILE_BASE_URL');

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

  /// Backends that receive credentials and bearer tokens. Keep in sync with
  /// `scripts/mobile-validate-dart-defines.js`, which fails the build first.
  static Map<String, String> get releaseRequiredUrls => {
    'NEXT_PUBLIC_SUPABASE_URL': supabaseUrl,
    'API_BASE_URL': apiBaseUrl,
  };

  static Map<String, String> get releaseOptionalUrls => {
    'TASKS_API_BASE_URL': tasksApiBaseUrl,
    'FINANCE_API_BASE_URL': financeApiBaseUrl,
    'INVENTORY_API_BASE_URL': inventoryApiBaseUrl,
    'CONTACTS_API_BASE_URL': contactsApiBaseUrl,
    'CALENDAR_API_BASE_URL': calendarApiBaseUrl,
    'TEACH_API_BASE_URL': teachApiBaseUrl,
    'TRACK_API_BASE_URL': trackApiBaseUrl,
    'MAIL_API_BASE_URL': mailApiBaseUrl,
    'INFRASTRUCTURE_API_BASE_URL': infrastructureApiBaseUrl,
  };

  /// Throws [InsecureEnvException] in release builds unless every backend URL
  /// is https. Debug and profile builds may keep localhost http.
  static void assertSecureForRelease({bool releaseMode = _isRelease}) =>
      assertSecureBackendUrls(
        releaseMode: releaseMode,
        requiredUrls: releaseRequiredUrls,
        optionalUrls: releaseOptionalUrls,
      );
}
