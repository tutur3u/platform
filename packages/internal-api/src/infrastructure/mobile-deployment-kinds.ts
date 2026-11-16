// Resource names accepted by the mobile deployment vault. The Mac App Store
// entries are optional and ride in the iOS bundle only as a complete set.
export type MobileDeploymentPlatform = 'android' | 'ios';
export type MobileDeploymentFileKind =
  | 'android_google_services_json'
  | 'ios_google_service_info_plist'
  | 'android_upload_keystore'
  | 'google_play_service_account_json'
  | 'apple_distribution_certificate_p12'
  | 'apple_app_store_provisioning_profile'
  | 'app_store_connect_private_key_p8'
  | 'apple_mac_installer_certificate_p12'
  | 'apple_mac_app_store_provisioning_profile';
export type MobileDeploymentScalarName =
  | 'ANDROID_KEYSTORE_ALIAS'
  | 'ANDROID_KEYSTORE_PASSWORD'
  | 'ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD'
  | 'GOOGLE_PLAY_PACKAGE_NAME'
  | 'GOOGLE_PLAY_TRACK'
  | 'APPLE_BUNDLE_ID'
  | 'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD'
  | 'APPLE_TEAM_ID'
  | 'APP_STORE_CONNECT_API_KEY_ID'
  | 'APP_STORE_CONNECT_ISSUER_ID'
  | 'APPLE_MAC_INSTALLER_CERTIFICATE_PASSWORD';
