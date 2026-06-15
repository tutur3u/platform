import type {
  MobileDeploymentFileKind,
  MobileDeploymentPlatform,
  MobileDeploymentScalarName,
} from './constants';

export interface MobileDeploymentEnvironmentRow {
  id: string;
  environment: string;
  active_version_id: string | null;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface MobileDeploymentVersionRow {
  id: string;
  environment_id: string;
  version: number;
  status: 'active' | 'archived' | 'draft';
  data_key_ciphertext: string;
  activated_at: string | null;
  activated_by: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface MobileDeploymentSecretValueRow {
  id: string;
  version_id: string;
  kind: 'env' | 'scalar';
  name: string;
  encrypted_value: string;
  plaintext_sha256: string;
  plaintext_last_four: string;
  value_size: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface MobileDeploymentFileArtifactRow {
  id: string;
  version_id: string;
  kind: MobileDeploymentFileKind;
  storage_provider: 'r2' | 'supabase';
  storage_path: string;
  filename: string;
  content_type: string;
  ciphertext_sha256: string;
  plaintext_sha256: string;
  plaintext_size: number;
  ciphertext_size: number;
  validation_status: 'invalid' | 'valid';
  validation_errors: string[];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface MobileDeploymentCiTokenRow {
  id: string;
  environment_id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  last_four: string;
  platforms: MobileDeploymentPlatform[];
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  created_by: string | null;
  last_used_at: string | null;
}

export interface MobileDeploymentAuditEventRow {
  id: string;
  environment_id: string;
  version_id: string | null;
  token_id: string | null;
  actor_user_id: string | null;
  actor_type: 'ci' | 'user';
  event_type: string;
  resource_kind: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
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

export interface MobileDeploymentVersionStatus {
  activatedAt: string | null;
  createdAt: string;
  id: string;
  ready: boolean;
  readinessErrors: string[];
  status: MobileDeploymentVersionRow['status'];
  version: number;
}

export interface MobileDeploymentState {
  activeVersion: MobileDeploymentVersionStatus | null;
  auditEvents: Array<{
    actorType: 'ci' | 'user';
    createdAt: string;
    eventType: string;
    id: string;
    metadata: Record<string, unknown>;
    resourceKind: string | null;
  }>;
  draftVersion: MobileDeploymentVersionStatus | null;
  envKeys: MobileDeploymentResourceStatus[];
  fileArtifacts: MobileDeploymentResourceStatus[];
  scalarValues: MobileDeploymentResourceStatus[];
  tokens: MobileDeploymentTokenStatus[];
}

export interface MobileDeploymentBundleFile {
  base64: string;
  contentType: string;
  filename: string;
  kind: MobileDeploymentFileKind;
  sha256: string;
  size: number;
}

export interface MobileDeploymentBundle {
  environment: 'production';
  envFile: string;
  files: Record<string, MobileDeploymentBundleFile>;
  platform: MobileDeploymentPlatform;
  resourceVersionIds: {
    files: Record<MobileDeploymentFileKind, string | undefined>;
    scalars: Record<MobileDeploymentScalarName, string | undefined>;
  };
  scalarValues: Partial<Record<MobileDeploymentScalarName, string>>;
  versionId: string;
  versionNumber: number;
}
