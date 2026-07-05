export const WORKSPACE_STORAGE_PROVIDER_SUPABASE = 'supabase';
export const WORKSPACE_STORAGE_PROVIDER_R2 = 'r2';

export const WORKSPACE_STORAGE_PROVIDER_OPTIONS = [
  WORKSPACE_STORAGE_PROVIDER_SUPABASE,
  WORKSPACE_STORAGE_PROVIDER_R2,
] as const;

export type WorkspaceStorageProvider =
  (typeof WORKSPACE_STORAGE_PROVIDER_OPTIONS)[number];

export const DRIVE_STORAGE_PROVIDER_SECRET = 'DRIVE_STORAGE_PROVIDER';
export const DRIVE_R2_BUCKET_SECRET = 'DRIVE_R2_BUCKET';
export const DRIVE_R2_ENDPOINT_SECRET = 'DRIVE_R2_ENDPOINT';
export const DRIVE_R2_ACCESS_KEY_ID_SECRET = 'DRIVE_R2_ACCESS_KEY_ID';
export const DRIVE_R2_SECRET_ACCESS_KEY_SECRET = 'DRIVE_R2_SECRET_ACCESS_KEY';
export const DRIVE_AUTO_EXTRACT_ZIP_SECRET = 'DRIVE_AUTO_EXTRACT_ZIP';
export const DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET =
  'DRIVE_AUTO_EXTRACT_PROXY_URL';
export const DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET =
  'DRIVE_AUTO_EXTRACT_PROXY_TOKEN';

export const DRIVE_STORAGE_SECRET_NAMES = [
  DRIVE_STORAGE_PROVIDER_SECRET,
  DRIVE_R2_BUCKET_SECRET,
  DRIVE_R2_ENDPOINT_SECRET,
  DRIVE_R2_ACCESS_KEY_ID_SECRET,
  DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
  DRIVE_AUTO_EXTRACT_ZIP_SECRET,
  DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
  DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
] as const;

export interface WorkspaceStorageSecretDefinition {
  name: (typeof DRIVE_STORAGE_SECRET_NAMES)[number];
  description: string;
  section: 'provider' | 'zip-automation';
  type: 'boolean' | 'number' | 'bytes' | 'string' | 'duration_ms';
  defaultValue?: string;
  options?: readonly string[];
  placeholder?: string;
  sensitive?: boolean;
  rolloutRequired?: boolean;
}

export const WORKSPACE_STORAGE_PROVIDER_SECRET_DEFINITIONS: readonly WorkspaceStorageSecretDefinition[] =
  [
    {
      name: DRIVE_STORAGE_PROVIDER_SECRET,
      description:
        'Selects the Drive backend for this workspace. Use "supabase" for the current storage path or "r2" to route Drive through Cloudflare R2.',
      section: 'provider',
      type: 'string',
      defaultValue: WORKSPACE_STORAGE_PROVIDER_SUPABASE,
      options: [...WORKSPACE_STORAGE_PROVIDER_OPTIONS],
      rolloutRequired: true,
    },
    {
      name: DRIVE_R2_BUCKET_SECRET,
      description:
        'Cloudflare R2 bucket name used for Drive objects when the provider is set to "r2".',
      section: 'provider',
      type: 'string',
      placeholder: 'workspace-drive',
      rolloutRequired: true,
    },
    {
      name: DRIVE_R2_ENDPOINT_SECRET,
      description:
        'S3-compatible R2 endpoint. Example: https://<account-id>.r2.cloudflarestorage.com',
      section: 'provider',
      type: 'string',
      placeholder: 'https://<account-id>.r2.cloudflarestorage.com',
      rolloutRequired: true,
    },
    {
      name: DRIVE_R2_ACCESS_KEY_ID_SECRET,
      description:
        'Access key ID for the Cloudflare R2 token used by the server-side Drive adapter.',
      section: 'provider',
      type: 'string',
      placeholder: 'R2 access key ID',
      sensitive: true,
      rolloutRequired: true,
    },
    {
      name: DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
      description:
        'Secret access key for the Cloudflare R2 token used by the server-side Drive adapter.',
      section: 'provider',
      type: 'string',
      placeholder: 'R2 secret access key',
      sensitive: true,
      rolloutRequired: true,
    },
  ] as const;

export const WORKSPACE_STORAGE_AUTO_EXTRACT_SECRET_DEFINITIONS: readonly WorkspaceStorageSecretDefinition[] =
  [
    {
      name: DRIVE_AUTO_EXTRACT_ZIP_SECRET,
      description:
        'Enables automatic ZIP extraction after uploads. Disabled by default.',
      section: 'zip-automation',
      type: 'boolean',
      defaultValue: 'false',
    },
    {
      name: DRIVE_AUTO_EXTRACT_PROXY_URL_SECRET,
      description:
        'HTTPS URL for the self-hosted ZIP extraction proxy. This is only used when auto extraction is enabled.',
      section: 'zip-automation',
      type: 'string',
      placeholder: 'https://zip-proxy.example.com/extract',
    },
    {
      name: DRIVE_AUTO_EXTRACT_PROXY_TOKEN_SECRET,
      description:
        'Shared bearer token used to authenticate requests to the ZIP extraction proxy and its callback route.',
      section: 'zip-automation',
      type: 'string',
      placeholder: 'Shared proxy token',
      sensitive: true,
    },
  ] as const;

export const WORKSPACE_STORAGE_SECRET_DEFINITIONS: readonly WorkspaceStorageSecretDefinition[] =
  [
    ...WORKSPACE_STORAGE_PROVIDER_SECRET_DEFINITIONS,
    ...WORKSPACE_STORAGE_AUTO_EXTRACT_SECRET_DEFINITIONS,
  ] as const;
