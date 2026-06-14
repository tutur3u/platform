import type { PermissionId } from '@tuturuuu/types';
import { GITHUB_OWNER, GITHUB_REPO } from '@tuturuuu/utils/constants';

export const MOBILE_DEPLOYMENT_ENVIRONMENT = 'production' as const;
export const MOBILE_DEPLOYMENT_GITHUB_ENVIRONMENT =
  'mobile-store-beta' as const;
export const MOBILE_DEPLOYMENT_WORKFLOW_FILE =
  '.github/workflows/mobile-deploy-stores.yaml' as const;
export const MOBILE_DEPLOYMENT_OIDC_AUDIENCE =
  'tuturuuu-mobile-deployment' as const;
export const MOBILE_DEPLOYMENT_REPOSITORY =
  `${GITHUB_OWNER}/${GITHUB_REPO}` as const;
export const MOBILE_DEPLOYMENT_REF = 'refs/heads/production' as const;
export const MOBILE_DEPLOYMENT_WORKFLOW_REF =
  `${MOBILE_DEPLOYMENT_REPOSITORY}/${MOBILE_DEPLOYMENT_WORKFLOW_FILE}@${MOBILE_DEPLOYMENT_REF}` as const;

export const MOBILE_DEPLOYMENT_DRIVE_PREFIX =
  '.tuturuuu/mobile-deployment-vault' as const;
export const MOBILE_DEPLOYMENT_VAULT_PERMISSION =
  'manage_mobile_deployment_vault' as PermissionId;

export const MOBILE_DEPLOYMENT_TOKEN_PREFIX = 'ttr_mobile_ci_' as const;
export const MOBILE_DEPLOYMENT_TOKEN_LOOKUP_LENGTH = 28;

export const EXPECTED_ANDROID_PACKAGE_NAME = 'com.tuturuuu.app.mobile' as const;
export const EXPECTED_IOS_BUNDLE_ID = 'com.tuturuuu.app.mobile' as const;
export const GOOGLE_PLAY_TRACK = 'internal' as const;

export const MOBILE_DEPLOYMENT_PLATFORMS = ['android', 'ios'] as const;
export type MobileDeploymentPlatform =
  (typeof MOBILE_DEPLOYMENT_PLATFORMS)[number];

export const MOBILE_DEPLOYMENT_FILE_KINDS = [
  'android_google_services_json',
  'ios_google_service_info_plist',
  'android_upload_keystore',
  'google_play_service_account_json',
  'apple_distribution_certificate_p12',
  'apple_app_store_provisioning_profile',
  'app_store_connect_private_key_p8',
] as const;
export type MobileDeploymentFileKind =
  (typeof MOBILE_DEPLOYMENT_FILE_KINDS)[number];

export const MOBILE_DEPLOYMENT_SCALAR_NAMES = [
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
] as const;
export type MobileDeploymentScalarName =
  (typeof MOBILE_DEPLOYMENT_SCALAR_NAMES)[number];

export const ANDROID_REQUIRED_FILE_KINDS = [
  'android_google_services_json',
  'android_upload_keystore',
  'google_play_service_account_json',
] as const satisfies readonly MobileDeploymentFileKind[];

export const IOS_REQUIRED_FILE_KINDS = [
  'ios_google_service_info_plist',
  'apple_distribution_certificate_p12',
  'apple_app_store_provisioning_profile',
  'app_store_connect_private_key_p8',
] as const satisfies readonly MobileDeploymentFileKind[];

export const ANDROID_REQUIRED_SCALARS = [
  'ANDROID_KEYSTORE_ALIAS',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD',
  'GOOGLE_PLAY_PACKAGE_NAME',
  'GOOGLE_PLAY_TRACK',
] as const satisfies readonly MobileDeploymentScalarName[];

export const IOS_REQUIRED_SCALARS = [
  'APPLE_BUNDLE_ID',
  'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD',
  'APPLE_TEAM_ID',
  'APP_STORE_CONNECT_API_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
] as const satisfies readonly MobileDeploymentScalarName[];

export const BLOCKED_ENV_FILE_KEYS = [
  'MOBILE_ANDROID_GOOGLE_SERVICES_JSON_B64',
  'MOBILE_IOS_GOOGLE_SERVICE_INFO_PLIST_B64',
  'ANDROID_UPLOAD_KEYSTORE_B64',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
  'APPLE_DISTRIBUTION_CERTIFICATE_P12_B64',
  'APP_STORE_CONNECT_PRIVATE_KEY',
] as const;

export const MAX_ENV_VALUE_BYTES = 16 * 1024;
export const MAX_SCALAR_VALUE_BYTES = 32 * 1024;
export const MAX_MOBILE_DEPLOYMENT_FILE_BYTES = 2 * 1024 * 1024;

export const FILE_KIND_LABELS: Record<MobileDeploymentFileKind, string> = {
  android_google_services_json: 'Android Firebase google-services.json',
  ios_google_service_info_plist: 'iOS Firebase GoogleService-Info.plist',
  android_upload_keystore: 'Android upload keystore',
  google_play_service_account_json: 'Google Play service account JSON',
  apple_distribution_certificate_p12: 'Apple distribution certificate .p12',
  apple_app_store_provisioning_profile: 'Apple App Store provisioning profile',
  app_store_connect_private_key_p8: 'App Store Connect private key .p8',
};
