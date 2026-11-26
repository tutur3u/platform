/** Mobile deployment vault shapes for the infrastructure admin API. */

export type MobileDeploymentPlatform = 'android' | 'ios';
export type MobileDeploymentFileKind =
  | 'android_google_services_json'
  | 'ios_google_service_info_plist'
  | 'android_upload_keystore'
  | 'google_play_service_account_json'
  | 'apple_distribution_certificate_p12'
  | 'apple_app_store_provisioning_profile'
  | 'apple_watch_app_store_provisioning_profile'
  | 'apple_watch_widgets_app_store_provisioning_profile'
  | 'app_store_connect_private_key_p8';
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
  | 'APP_STORE_CONNECT_ISSUER_ID';
export type MobileDeploymentEnvKeyName = string;
export type MobileDeploymentSecretKind = 'env' | 'scalar';
export type InfrastructureJsonValue =
  | string
  | number
  | boolean
  | null
  | InfrastructureJsonValue[]
  | { [key: string]: InfrastructureJsonValue };

export interface SaveMobileDeploymentSecretPayload {
  kind: MobileDeploymentSecretKind;
  name: MobileDeploymentEnvKeyName | MobileDeploymentScalarName;
  previousName?: MobileDeploymentEnvKeyName;
  value: string;
}

export interface ClearMobileDeploymentSecretPayload {
  kind: MobileDeploymentSecretKind;
  name: MobileDeploymentEnvKeyName | MobileDeploymentScalarName;
}

export interface MobileDeploymentResourceStatus {
  configured: boolean;
  lastFour: string | null;
  name: string;
  plaintextSha256: string | null;
  size: number | null;
  updatedAt: string | null;
  validationErrors: string[];
  /**
   * Plaintext value for non-secret fields (public URLs, fixed identifiers,
   * feature flags, the Play track); `null` for secrets and files.
   */
  value: string | null;
}

export interface MobileDeploymentVersionStatus {
  activatedAt: string | null;
  createdAt: string;
  id: string;
  ready: boolean;
  readinessErrors: string[];
  status: 'active' | 'archived' | 'draft';
  version: number;
}

export interface MobileDeploymentTokenStatus {
  createdAt: string;
  expiresAt: string;
  id: string;
  lastFour: string;
  lastUsedAt: string | null;
  name: string;
  platforms: MobileDeploymentPlatform[];
  prefix: string;
  revokedAt: string | null;
}

export interface MobileDeploymentAuditEvent {
  actorType: 'ci' | 'user';
  createdAt: string;
  eventType: string;
  id: string;
  metadata: Record<string, InfrastructureJsonValue>;
  resourceKind: string | null;
}

export interface MobileDeploymentState {
  activeVersion: MobileDeploymentVersionStatus | null;
  auditEvents: MobileDeploymentAuditEvent[];
  draftVersion: MobileDeploymentVersionStatus | null;
  envKeys: MobileDeploymentResourceStatus[];
  fileArtifacts: MobileDeploymentResourceStatus[];
  scalarValues: MobileDeploymentResourceStatus[];
  tokens: MobileDeploymentTokenStatus[];
}

export interface IssueMobileDeploymentCiTokenPayload {
  expiresInDays?: number;
  name: string;
  platforms?: MobileDeploymentPlatform[];
}

export interface IssueMobileDeploymentCiTokenResponse {
  state: MobileDeploymentState;
  token: string;
}
