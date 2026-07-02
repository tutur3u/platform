/**
 * Language-neutral documentation links for each mobile deployment field.
 *
 * Keyed by the exact field name rendered in the UI (scalar secret names,
 * preset env keys, file artifact kinds, plus the synthetic `CI_TOKEN_NAME`).
 * The human-readable guidance prose lives in the `mobile-deployment-settings`
 * message bundles under `guidance.fields.<field>`; only the (untranslated)
 * console URLs are kept here.
 *
 * This record is also the source of truth for which fields get a help icon:
 * a field absent from this map (e.g. a user-created custom env var) renders
 * no tooltip.
 */
export const MOBILE_DEPLOYMENT_FIELD_DOCS: Record<string, { url?: string }> = {
  // Android signing scalars
  ANDROID_KEYSTORE_ALIAS: {
    url: 'https://developer.android.com/studio/publish/app-signing',
  },
  ANDROID_KEYSTORE_PASSWORD: {
    url: 'https://developer.android.com/studio/publish/app-signing',
  },
  ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD: {
    url: 'https://developer.android.com/studio/publish/app-signing',
  },

  // Google Play scalars
  GOOGLE_PLAY_PACKAGE_NAME: {
    url: 'https://play.google.com/console',
  },
  GOOGLE_PLAY_TRACK: {
    url: 'https://support.google.com/googleplay/android-developer/answer/9859348',
  },

  // Apple signing scalars
  APPLE_BUNDLE_ID: {
    url: 'https://developer.apple.com/account/resources/identifiers/list',
  },
  APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD: {
    url: 'https://developer.apple.com/account/resources/certificates/list',
  },
  APPLE_TEAM_ID: {
    url: 'https://developer.apple.com/account',
  },

  // App Store Connect scalars
  APP_STORE_CONNECT_API_KEY_ID: {
    url: 'https://appstoreconnect.apple.com/access/integrations/api',
  },
  APP_STORE_CONNECT_ISSUER_ID: {
    url: 'https://appstoreconnect.apple.com/access/integrations/api',
  },

  // Preset environment variables
  NEXT_PUBLIC_SUPABASE_URL: {
    url: 'https://supabase.com/dashboard',
  },
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: {
    url: 'https://supabase.com/dashboard',
  },
  API_BASE_URL: {},
  TURNSTILE_SITE_KEY: {
    url: 'https://dash.cloudflare.com/?to=/:account/turnstile',
  },
  TURNSTILE_BASE_URL: {},
  GOOGLE_WEB_CLIENT_ID: {
    url: 'https://console.cloud.google.com/apis/credentials',
  },
  GOOGLE_IOS_CLIENT_ID: {
    url: 'https://console.cloud.google.com/apis/credentials',
  },
  MOBILE_TASK_DESCRIPTION_EDITING_ENABLED: {},
  MOBILE_CALENDAR_INTEGRATIONS_ENABLED: {},

  // File artifacts
  android_google_services_json: {
    url: 'https://console.firebase.google.com',
  },
  ios_google_service_info_plist: {
    url: 'https://console.firebase.google.com',
  },
  android_upload_keystore: {
    url: 'https://developer.android.com/studio/publish/app-signing#generate-key',
  },
  google_play_service_account_json: {
    url: 'https://developers.google.com/android-publisher/getting_started',
  },
  apple_distribution_certificate_p12: {
    url: 'https://developer.apple.com/account/resources/certificates/list',
  },
  apple_app_store_provisioning_profile: {
    url: 'https://developer.apple.com/account/resources/profiles/list',
  },
  app_store_connect_private_key_p8: {
    url: 'https://appstoreconnect.apple.com/access/integrations/api',
  },

  // CI token name (self-chosen label, no external doc)
  CI_TOKEN_NAME: {},
};

/** Stable doc URL for the full mobile deployment setup runbook. */
export const MOBILE_DEPLOYMENT_SETUP_GUIDE_URL =
  'https://docs.tuturuuu.com/build/devops/mobile-store-deployment';
