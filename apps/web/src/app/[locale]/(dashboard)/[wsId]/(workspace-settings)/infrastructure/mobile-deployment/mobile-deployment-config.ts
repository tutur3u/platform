import type {
  MobileDeploymentFileKind,
  MobileDeploymentScalarName,
} from '@tuturuuu/internal-api/infrastructure';

export const MOBILE_DEPLOYMENT_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'API_BASE_URL',
  'TURNSTILE_SITE_KEY',
  'TURNSTILE_BASE_URL',
  'GOOGLE_WEB_CLIENT_ID',
  'GOOGLE_IOS_CLIENT_ID',
  'MOBILE_TASK_DESCRIPTION_EDITING_ENABLED',
  'MOBILE_CALENDAR_INTEGRATIONS_ENABLED',
] as const;

export const MOBILE_DEPLOYMENT_FILE_KINDS: MobileDeploymentFileKind[] = [
  'android_google_services_json',
  'ios_google_service_info_plist',
  'android_upload_keystore',
  'google_play_service_account_json',
  'apple_distribution_certificate_p12',
  'apple_app_store_provisioning_profile',
  'app_store_connect_private_key_p8',
];

export const MOBILE_DEPLOYMENT_SCALAR_NAMES: MobileDeploymentScalarName[] = [
  'ANDROID_KEYSTORE_ALIAS',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD',
  'GOOGLE_PLAY_PACKAGE_NAME',
  'GOOGLE_PLAY_TRACK',
  'APPLE_BUNDLE_ID',
  'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD',
  'APPLE_TEAM_ID',
  'APP_STORE_CONNECT_API_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
];
