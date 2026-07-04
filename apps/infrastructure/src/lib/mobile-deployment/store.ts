import 'server-only';

import { randomBytes } from 'node:crypto';
import { hashApiKey, validateApiKeyHash } from '@tuturuuu/auth/api-keys';
import type { InfrastructureJsonValue } from '@tuturuuu/internal-api/infrastructure/types';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  downloadWorkspaceStorageObjectForProvider,
  uploadWorkspaceStorageFileDirect,
} from '@/lib/workspace-storage-provider';
import {
  ANDROID_REQUIRED_FILE_KINDS,
  ANDROID_REQUIRED_SCALARS,
  EXPECTED_ANDROID_PACKAGE_NAME,
  EXPECTED_IOS_BUNDLE_ID,
  FILE_KIND_LABELS,
  GOOGLE_PLAY_TRACK,
  IOS_REQUIRED_FILE_KINDS,
  IOS_REQUIRED_SCALARS,
  MOBILE_DEPLOYMENT_ENVIRONMENT,
  MOBILE_DEPLOYMENT_NON_SECRET_NAMES,
  MOBILE_DEPLOYMENT_SCALAR_NAMES,
  MOBILE_DEPLOYMENT_TOKEN_LOOKUP_LENGTH,
  MOBILE_DEPLOYMENT_TOKEN_PREFIX,
  type MobileDeploymentFileKind,
  type MobileDeploymentPlatform,
  type MobileDeploymentScalarName,
} from './constants';
import {
  createEncryptedDataKey,
  decryptBytes,
  decryptDataKey,
  decryptSecretValue,
  encryptBytes,
  encryptSecretValue,
  redactLastFour,
  sha256Base64Url,
  sha256Hex,
} from './crypto';
import type { MobileDeploymentGitHubOidcClaims } from './oidc';
import { buildMobileDeploymentVaultStoragePath } from './storage-policy';
import type {
  MobileDeploymentAuditEventRow,
  MobileDeploymentBundle,
  MobileDeploymentCiTokenRow,
  MobileDeploymentEnvironmentRow,
  MobileDeploymentFileArtifactRow,
  MobileDeploymentResourceStatus,
  MobileDeploymentSecretValueRow,
  MobileDeploymentState,
  MobileDeploymentVersionRow,
  MobileDeploymentVersionStatus,
} from './types';
import {
  assertMobileDeploymentEnvKey,
  normalizeEnvEntry,
  parseEnvFile,
  renderEnvFile,
  validateFileArtifact,
  validateScalarValue,
} from './validation';

type AdminClient = SupabaseClient<Database>;
type MobileDeploymentSecretKind = MobileDeploymentSecretValueRow['kind'];

function toInfrastructureJsonValue(value: unknown): InfrastructureJsonValue {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toInfrastructureJsonValue(entry));
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        toInfrastructureJsonValue(entry),
      ])
    );
  }

  return String(value);
}

function toInfrastructureMetadata(
  metadata: Record<string, unknown> | null | undefined
): Record<string, InfrastructureJsonValue> {
  return toInfrastructureJsonValue(metadata ?? {}) as Record<
    string,
    InfrastructureJsonValue
  >;
}

export class MobileDeploymentStoreError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = 'mobile_deployment_error'
  ) {
    super(message);
    this.name = 'MobileDeploymentStoreError';
  }
}

function privateDb(db: AdminClient) {
  return db.schema('private');
}

function nowIso() {
  return new Date().toISOString();
}

function assertNoError(error: unknown, message: string): asserts error is null {
  if (error) {
    const detail =
      typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message)
        : message;
    throw new MobileDeploymentStoreError(detail || message, 500);
  }
}

function requiredFilesForPlatform(platform: MobileDeploymentPlatform) {
  return platform === 'android'
    ? ANDROID_REQUIRED_FILE_KINDS
    : IOS_REQUIRED_FILE_KINDS;
}

function requiredScalarsForPlatform(platform: MobileDeploymentPlatform) {
  return platform === 'android'
    ? ANDROID_REQUIRED_SCALARS
    : IOS_REQUIRED_SCALARS;
}

function mapVersionStatus(
  version: MobileDeploymentVersionRow | null,
  readinessErrors: string[]
): MobileDeploymentVersionStatus | null {
  if (!version) {
    return null;
  }

  return {
    activatedAt: version.activated_at,
    createdAt: version.created_at,
    id: version.id,
    readinessErrors,
    ready: readinessErrors.length === 0,
    status: version.status,
    version: version.version,
  };
}

function mapSecretStatus(
  row: MobileDeploymentSecretValueRow,
  dataKey: Buffer | null
): MobileDeploymentResourceStatus {
  // Non-secret fields (public URLs, fixed identifiers, feature flags, the Play
  // track) expose their plaintext value so an authorized vault admin can verify
  // what was saved. A decryption failure must never break the whole page.
  let value: string | null = null;
  if (dataKey && MOBILE_DEPLOYMENT_NON_SECRET_NAMES.has(row.name)) {
    try {
      value = decryptSecretValue(row.encrypted_value, dataKey);
    } catch {
      value = null;
    }
  }

  return {
    configured: true,
    lastFour: row.plaintext_last_four,
    name: row.name,
    plaintextSha256: row.plaintext_sha256,
    size: row.value_size,
    updatedAt: row.updated_at,
    validationErrors: [],
    value,
  };
}

function mapFileStatus(
  row: MobileDeploymentFileArtifactRow
): MobileDeploymentResourceStatus {
  return {
    configured: row.validation_status === 'valid',
    lastFour: null,
    name: row.kind,
    plaintextSha256: row.plaintext_sha256,
    size: row.plaintext_size,
    updatedAt: row.updated_at,
    validationErrors: row.validation_errors ?? [],
    value: null,
  };
}

function buildSecretValueRow({
  dataKey,
  kind,
  name,
  userId,
  value,
  versionId,
}: {
  dataKey: Buffer;
  kind: MobileDeploymentSecretKind;
  name: string;
  userId: string;
  value: string;
  versionId: string;
}) {
  return {
    encrypted_value: encryptSecretValue(value, dataKey),
    kind,
    name,
    plaintext_last_four: redactLastFour(value),
    plaintext_sha256: sha256Base64Url(value),
    updated_at: nowIso(),
    updated_by: userId,
    value_size: new TextEncoder().encode(value).byteLength,
    version_id: versionId,
  };
}

async function getProductionEnvironment(db: AdminClient) {
  const schema = privateDb(db);
  const { data, error } = await schema
    .from('mobile_deployment_environments')
    .select('*')
    .eq('environment', MOBILE_DEPLOYMENT_ENVIRONMENT)
    .maybeSingle();

  assertNoError(error, 'Failed to load mobile deployment environment');
  if (data) {
    return data as MobileDeploymentEnvironmentRow;
  }

  const { data: inserted, error: insertError } = await schema
    .from('mobile_deployment_environments')
    .insert({ environment: MOBILE_DEPLOYMENT_ENVIRONMENT })
    .select('*')
    .single();
  assertNoError(
    insertError,
    'Failed to initialize mobile deployment environment'
  );

  return inserted as MobileDeploymentEnvironmentRow;
}

async function getLatestVersionByStatus(
  db: AdminClient,
  environmentId: string,
  status: MobileDeploymentVersionRow['status']
) {
  const { data, error } = await privateDb(db)
    .from('mobile_deployment_versions')
    .select('*')
    .eq('environment_id', environmentId)
    .eq('status', status)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  assertNoError(error, 'Failed to load mobile deployment version');
  return (data as MobileDeploymentVersionRow | null) ?? null;
}

async function getVersionById(db: AdminClient, versionId: string | null) {
  if (!versionId) {
    return null;
  }

  const { data, error } = await privateDb(db)
    .from('mobile_deployment_versions')
    .select('*')
    .eq('id', versionId)
    .maybeSingle();

  assertNoError(error, 'Failed to load mobile deployment version');
  return (data as MobileDeploymentVersionRow | null) ?? null;
}

async function createDraftVersion(
  db: AdminClient,
  environmentId: string,
  userId: string | null
) {
  const { data: latest, error: latestError } = await privateDb(db)
    .from('mobile_deployment_versions')
    .select('version')
    .eq('environment_id', environmentId)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  assertNoError(latestError, 'Failed to inspect mobile deployment versions');

  const { encryptedDataKey } = await createEncryptedDataKey();
  const { data, error } = await privateDb(db)
    .from('mobile_deployment_versions')
    .insert({
      created_by: userId,
      data_key_ciphertext: encryptedDataKey,
      environment_id: environmentId,
      status: 'draft',
      version:
        Number((latest as { version?: number } | null)?.version ?? 0) + 1,
    })
    .select('*')
    .single();
  assertNoError(error, 'Failed to create mobile deployment draft');

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId,
    eventType: 'version.draft_created',
    metadata: { version: (data as MobileDeploymentVersionRow).version },
    versionId: (data as MobileDeploymentVersionRow).id,
  });

  return data as MobileDeploymentVersionRow;
}

async function getOrCreateDraftVersion(
  db: AdminClient,
  environmentId: string,
  userId: string | null
) {
  const draft = await getLatestVersionByStatus(db, environmentId, 'draft');
  return draft ?? createDraftVersion(db, environmentId, userId);
}

async function listSecretsForVersion(db: AdminClient, versionId: string) {
  const { data, error } = await privateDb(db)
    .from('mobile_deployment_secret_values')
    .select('*')
    .eq('version_id', versionId);
  assertNoError(error, 'Failed to load mobile deployment secret values');
  return (data ?? []) as MobileDeploymentSecretValueRow[];
}

async function listFilesForVersion(db: AdminClient, versionId: string) {
  const { data, error } = await privateDb(db)
    .from('mobile_deployment_file_artifacts')
    .select('*')
    .eq('version_id', versionId);
  assertNoError(error, 'Failed to load mobile deployment files');
  return (data ?? []) as MobileDeploymentFileArtifactRow[];
}

function evaluateVersionReadiness(
  version: MobileDeploymentVersionRow | null,
  secrets: MobileDeploymentSecretValueRow[],
  files: MobileDeploymentFileArtifactRow[]
) {
  if (!version) {
    return ['No version exists'];
  }

  const errors: string[] = [];
  const envCount = secrets.filter((row) => row.kind === 'env').length;
  if (envCount === 0) {
    errors.push('No build secrets are configured');
  }

  const scalarNames = new Set(
    secrets
      .filter((row) => row.kind === 'scalar')
      .map((row) => row.name as MobileDeploymentScalarName)
  );
  const fileKinds = new Map(files.map((row) => [row.kind, row]));

  for (const scalar of [...ANDROID_REQUIRED_SCALARS, ...IOS_REQUIRED_SCALARS]) {
    if (!scalarNames.has(scalar)) {
      errors.push(`${scalar} is missing`);
    }
  }

  for (const fileKind of [
    ...ANDROID_REQUIRED_FILE_KINDS,
    ...IOS_REQUIRED_FILE_KINDS,
  ]) {
    const file = fileKinds.get(fileKind);
    if (!file) {
      errors.push(`${FILE_KIND_LABELS[fileKind]} is missing`);
      continue;
    }

    if (file.validation_status !== 'valid') {
      errors.push(
        ...file.validation_errors.map((error) => `${fileKind}: ${error}`)
      );
    }
  }

  return errors;
}

export async function listMobileDeploymentState(db: AdminClient) {
  const environment = await getProductionEnvironment(db);
  const [activeVersion, draftVersion, tokens, auditEvents] = await Promise.all([
    getVersionById(db, environment.active_version_id),
    getLatestVersionByStatus(db, environment.id, 'draft'),
    privateDb(db)
      .from('mobile_deployment_ci_tokens')
      .select('*')
      .eq('environment_id', environment.id)
      .order('created_at', { ascending: false })
      .limit(30),
    privateDb(db)
      .from('mobile_deployment_audit_events')
      .select('*')
      .eq('environment_id', environment.id)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  assertNoError(tokens.error, 'Failed to load mobile deployment CI tokens');
  assertNoError(
    auditEvents.error,
    'Failed to load mobile deployment audit events'
  );

  const displayVersion = draftVersion ?? activeVersion;
  const [
    displaySecrets,
    displayFiles,
    activeSecrets,
    activeFiles,
    draftSecrets,
    draftFiles,
  ] = await Promise.all([
    displayVersion ? listSecretsForVersion(db, displayVersion.id) : [],
    displayVersion ? listFilesForVersion(db, displayVersion.id) : [],
    activeVersion ? listSecretsForVersion(db, activeVersion.id) : [],
    activeVersion ? listFilesForVersion(db, activeVersion.id) : [],
    draftVersion ? listSecretsForVersion(db, draftVersion.id) : [],
    draftVersion ? listFilesForVersion(db, draftVersion.id) : [],
  ]);

  // Decrypt the display version data key once so non-secret values can be
  // surfaced to authorized admins (see mapSecretStatus).
  const displayDataKey = displayVersion
    ? await decryptDataKey(displayVersion.data_key_ciphertext)
    : null;

  return {
    activeVersion: mapVersionStatus(
      activeVersion,
      evaluateVersionReadiness(activeVersion, activeSecrets, activeFiles)
    ),
    auditEvents: (
      (auditEvents.data ?? []) as MobileDeploymentAuditEventRow[]
    ).map((event) => ({
      actorType: event.actor_type,
      createdAt: event.created_at,
      eventType: event.event_type,
      id: event.id,
      metadata: toInfrastructureMetadata(event.metadata),
      resourceKind: event.resource_kind,
    })),
    draftVersion: mapVersionStatus(
      draftVersion,
      evaluateVersionReadiness(draftVersion, draftSecrets, draftFiles)
    ),
    envKeys: displaySecrets
      .filter((row) => row.kind === 'env')
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((row) => mapSecretStatus(row, displayDataKey)),
    fileArtifacts: displayFiles
      .sort((left, right) => left.kind.localeCompare(right.kind))
      .map(mapFileStatus),
    scalarValues: displaySecrets
      .filter((row) => row.kind === 'scalar')
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((row) => mapSecretStatus(row, displayDataKey)),
    tokens: ((tokens.data ?? []) as MobileDeploymentCiTokenRow[]).map(
      (token) => ({
        createdAt: token.created_at,
        expiresAt: token.expires_at,
        id: token.id,
        lastFour: token.last_four,
        lastUsedAt: token.last_used_at,
        name: token.name,
        platforms: token.platforms,
        prefix: token.token_prefix,
        revokedAt: token.revoked_at,
      })
    ),
  } satisfies MobileDeploymentState;
}

export async function saveMobileDeploymentEnvFile({
  contents,
  db,
  userId,
}: {
  contents: string;
  db: AdminClient;
  userId: string;
}) {
  const entries = parseEnvFile(contents);
  const environment = await getProductionEnvironment(db);
  const draft = await getOrCreateDraftVersion(db, environment.id, userId);
  const dataKey = await decryptDataKey(draft.data_key_ciphertext);
  const rows = Object.entries(entries).map(([name, value]) =>
    buildSecretValueRow({
      dataKey,
      kind: 'env',
      name,
      userId,
      value,
      versionId: draft.id,
    })
  );

  const schema = privateDb(db);
  const { error: deleteError } = await schema
    .from('mobile_deployment_secret_values')
    .delete()
    .eq('version_id', draft.id)
    .eq('kind', 'env');
  assertNoError(deleteError, 'Failed to replace mobile deployment env values');

  if (rows.length) {
    const { error } = await schema
      .from('mobile_deployment_secret_values')
      .insert(rows);
    assertNoError(error, 'Failed to save mobile deployment env values');
  }

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'env.replaced',
    metadata: { keyCount: rows.length },
    resourceKind: '.env.github',
    versionId: draft.id,
  });

  return listMobileDeploymentState(db);
}

export async function saveMobileDeploymentEnvKey({
  db,
  name,
  previousName,
  userId,
  value,
}: {
  db: AdminClient;
  name: string;
  previousName?: string;
  userId: string;
  value: string;
}) {
  const normalized = normalizeEnvEntry(name, value);
  const previousKey = previousName
    ? assertMobileDeploymentEnvKey(previousName)
    : null;
  const environment = await getProductionEnvironment(db);
  const draft = await getOrCreateDraftVersion(db, environment.id, userId);
  const dataKey = await decryptDataKey(draft.data_key_ciphertext);
  const schema = privateDb(db);

  const { error } = await schema.from('mobile_deployment_secret_values').upsert(
    buildSecretValueRow({
      dataKey,
      kind: 'env',
      name: normalized.key,
      userId,
      value: normalized.value,
      versionId: draft.id,
    }),
    { onConflict: 'version_id,kind,name' }
  );
  assertNoError(error, 'Failed to save mobile deployment env value');

  if (previousKey && previousKey !== normalized.key) {
    const { error: deleteError } = await schema
      .from('mobile_deployment_secret_values')
      .delete()
      .eq('version_id', draft.id)
      .eq('kind', 'env')
      .eq('name', previousKey);
    assertNoError(
      deleteError,
      'Failed to clear previous mobile deployment env value'
    );
  }

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'env.saved',
    metadata: { name: normalized.key, previousName: previousKey },
    resourceKind: normalized.key,
    versionId: draft.id,
  });

  return listMobileDeploymentState(db);
}

export async function clearMobileDeploymentEnvKey({
  db,
  name,
  userId,
}: {
  db: AdminClient;
  name: string;
  userId: string;
}) {
  const key = assertMobileDeploymentEnvKey(name);
  const environment = await getProductionEnvironment(db);
  const draft = await getOrCreateDraftVersion(db, environment.id, userId);

  const { error } = await privateDb(db)
    .from('mobile_deployment_secret_values')
    .delete()
    .eq('version_id', draft.id)
    .eq('kind', 'env')
    .eq('name', key);
  assertNoError(error, 'Failed to clear mobile deployment env value');

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'env.cleared',
    metadata: { name: key },
    resourceKind: key,
    versionId: draft.id,
  });

  return listMobileDeploymentState(db);
}

export async function saveMobileDeploymentScalar({
  db,
  name,
  userId,
  value,
}: {
  db: AdminClient;
  name: MobileDeploymentScalarName;
  userId: string;
  value: string;
}) {
  const normalizedValue = validateScalarValue(name, value);
  const environment = await getProductionEnvironment(db);
  const draft = await getOrCreateDraftVersion(db, environment.id, userId);
  const dataKey = await decryptDataKey(draft.data_key_ciphertext);

  const { error } = await privateDb(db)
    .from('mobile_deployment_secret_values')
    .upsert(
      buildSecretValueRow({
        dataKey,
        kind: 'scalar',
        name,
        userId,
        value: normalizedValue,
        versionId: draft.id,
      }),
      { onConflict: 'version_id,kind,name' }
    );
  assertNoError(error, 'Failed to save mobile deployment scalar');

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'scalar.saved',
    metadata: { name },
    resourceKind: name,
    versionId: draft.id,
  });

  return listMobileDeploymentState(db);
}

export async function clearMobileDeploymentScalar({
  db,
  name,
  userId,
}: {
  db: AdminClient;
  name: MobileDeploymentScalarName;
  userId: string;
}) {
  const environment = await getProductionEnvironment(db);
  const draft = await getOrCreateDraftVersion(db, environment.id, userId);

  const { error } = await privateDb(db)
    .from('mobile_deployment_secret_values')
    .delete()
    .eq('version_id', draft.id)
    .eq('kind', 'scalar')
    .eq('name', name);
  assertNoError(error, 'Failed to clear mobile deployment scalar');

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'scalar.cleared',
    metadata: { name },
    resourceKind: name,
    versionId: draft.id,
  });

  return listMobileDeploymentState(db);
}

export async function uploadMobileDeploymentFile({
  buffer,
  contentType,
  db,
  filename,
  kind,
  userId,
}: {
  buffer: Uint8Array;
  contentType: string;
  db: AdminClient;
  filename: string;
  kind: MobileDeploymentFileKind;
  userId: string;
}) {
  validateFileArtifact(kind, buffer);

  const environment = await getProductionEnvironment(db);
  const draft = await getOrCreateDraftVersion(db, environment.id, userId);
  const dataKey = await decryptDataKey(draft.data_key_ciphertext);
  const ciphertext = encryptBytes(buffer, dataKey);
  const storagePath = buildMobileDeploymentVaultStoragePath(
    draft.id,
    `${kind}.ciphertext.json`
  );
  const upload = await uploadWorkspaceStorageFileDirect(
    ROOT_WORKSPACE_ID,
    storagePath,
    ciphertext,
    {
      allowReservedMobileDeploymentVault: true,
      contentType: 'application/json',
      upsert: true,
    }
  );

  const { error } = await privateDb(db)
    .from('mobile_deployment_file_artifacts')
    .upsert(
      {
        ciphertext_sha256: sha256Hex(ciphertext),
        ciphertext_size: ciphertext.byteLength,
        content_type: contentType || 'application/octet-stream',
        filename,
        kind,
        plaintext_sha256: sha256Hex(buffer),
        plaintext_size: buffer.byteLength,
        storage_path: upload.path,
        storage_provider: upload.provider,
        updated_at: nowIso(),
        updated_by: userId,
        validation_errors: [],
        validation_status: 'valid',
        version_id: draft.id,
      },
      { onConflict: 'version_id,kind' }
    );
  assertNoError(error, 'Failed to save mobile deployment file metadata');

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'file.uploaded',
    metadata: { kind, size: buffer.byteLength },
    resourceKind: kind,
    versionId: draft.id,
  });

  return listMobileDeploymentState(db);
}

export async function activateMobileDeploymentDraft({
  db,
  userId,
}: {
  db: AdminClient;
  userId: string;
}) {
  const environment = await getProductionEnvironment(db);
  const draft = await getLatestVersionByStatus(db, environment.id, 'draft');
  if (!draft) {
    throw new MobileDeploymentStoreError('No draft version to activate', 400);
  }

  const [secrets, files] = await Promise.all([
    listSecretsForVersion(db, draft.id),
    listFilesForVersion(db, draft.id),
  ]);
  const readinessErrors = evaluateVersionReadiness(draft, secrets, files);
  if (readinessErrors.length) {
    throw new MobileDeploymentStoreError(
      'Mobile deployment draft is not ready',
      400,
      'draft_not_ready'
    );
  }

  const schema = privateDb(db);
  if (environment.active_version_id) {
    const { error: archiveError } = await schema
      .from('mobile_deployment_versions')
      .update({ status: 'archived', updated_at: nowIso() })
      .eq('id', environment.active_version_id);
    assertNoError(
      archiveError,
      'Failed to archive current mobile deployment version'
    );
  }

  const { error: activateError } = await schema
    .from('mobile_deployment_versions')
    .update({
      activated_at: nowIso(),
      activated_by: userId,
      status: 'active',
      updated_at: nowIso(),
    })
    .eq('id', draft.id);
  assertNoError(activateError, 'Failed to activate mobile deployment draft');

  const { error: environmentError } = await schema
    .from('mobile_deployment_environments')
    .update({
      active_version_id: draft.id,
      updated_at: nowIso(),
      updated_by: userId,
    })
    .eq('id', environment.id);
  assertNoError(
    environmentError,
    'Failed to set active mobile deployment version'
  );

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'version.activated',
    metadata: { version: draft.version },
    versionId: draft.id,
  });

  return listMobileDeploymentState(db);
}

export async function rollbackMobileDeploymentVersion({
  db,
  userId,
}: {
  db: AdminClient;
  userId: string;
}) {
  const environment = await getProductionEnvironment(db);
  const previous = await getLatestVersionByStatus(
    db,
    environment.id,
    'archived'
  );
  if (!previous) {
    throw new MobileDeploymentStoreError(
      'No archived version to roll back',
      400
    );
  }

  const schema = privateDb(db);
  if (environment.active_version_id) {
    const { error: currentError } = await schema
      .from('mobile_deployment_versions')
      .update({ status: 'archived', updated_at: nowIso() })
      .eq('id', environment.active_version_id);
    assertNoError(
      currentError,
      'Failed to archive current mobile deployment version'
    );
  }

  const { error: previousError } = await schema
    .from('mobile_deployment_versions')
    .update({
      activated_at: nowIso(),
      activated_by: userId,
      status: 'active',
      updated_at: nowIso(),
    })
    .eq('id', previous.id);
  assertNoError(
    previousError,
    'Failed to restore archived mobile deployment version'
  );

  const { error: environmentError } = await schema
    .from('mobile_deployment_environments')
    .update({
      active_version_id: previous.id,
      updated_at: nowIso(),
      updated_by: userId,
    })
    .eq('id', environment.id);
  assertNoError(
    environmentError,
    'Failed to set rollback mobile deployment version'
  );

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'version.rolled_back',
    metadata: { version: previous.version },
    versionId: previous.id,
  });

  return listMobileDeploymentState(db);
}

export async function issueMobileDeploymentCiToken({
  db,
  expiresInDays,
  name,
  platforms,
  userId,
}: {
  db: AdminClient;
  expiresInDays: number;
  name: string;
  platforms: MobileDeploymentPlatform[];
  userId: string;
}) {
  const environment = await getProductionEnvironment(db);
  const token = `${MOBILE_DEPLOYMENT_TOKEN_PREFIX}${randomBytes(32).toString(
    'base64url'
  )}`;
  const tokenPrefix = token.slice(0, MOBILE_DEPLOYMENT_TOKEN_LOOKUP_LENGTH);
  const expiresAt = new Date(
    Date.now() + Math.max(1, Math.min(expiresInDays, 365)) * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data, error } = await privateDb(db)
    .from('mobile_deployment_ci_tokens')
    .insert({
      created_by: userId,
      environment_id: environment.id,
      expires_at: expiresAt,
      last_four: redactLastFour(token),
      name: name.trim().slice(0, 120) || 'GitHub Actions CI token',
      platforms,
      token_hash: await hashApiKey(token),
      token_prefix: tokenPrefix,
    })
    .select('*')
    .single();
  assertNoError(error, 'Failed to issue mobile deployment CI token');

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'token.issued',
    metadata: {
      expiresAt,
      platforms,
      tokenId: (data as MobileDeploymentCiTokenRow).id,
    },
    tokenId: (data as MobileDeploymentCiTokenRow).id,
  });

  return {
    state: await listMobileDeploymentState(db),
    token,
  };
}

export async function revokeMobileDeploymentCiToken({
  db,
  tokenId,
  userId,
}: {
  db: AdminClient;
  tokenId: string;
  userId: string;
}) {
  const environment = await getProductionEnvironment(db);
  const { error } = await privateDb(db)
    .from('mobile_deployment_ci_tokens')
    .update({ revoked_at: nowIso(), revoked_by: userId })
    .eq('environment_id', environment.id)
    .eq('id', tokenId);
  assertNoError(error, 'Failed to revoke mobile deployment CI token');

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'token.revoked',
    metadata: { tokenId },
    tokenId,
  });

  return listMobileDeploymentState(db);
}

async function validateCiToken({
  db,
  environmentId,
  platform,
  token,
}: {
  db: AdminClient;
  environmentId: string;
  platform: MobileDeploymentPlatform;
  token: string;
}) {
  if (!token.startsWith(MOBILE_DEPLOYMENT_TOKEN_PREFIX)) {
    throw new MobileDeploymentStoreError('Unauthorized', 401, 'invalid_token');
  }

  const tokenPrefix = token.slice(0, MOBILE_DEPLOYMENT_TOKEN_LOOKUP_LENGTH);
  const { data, error } = await privateDb(db)
    .from('mobile_deployment_ci_tokens')
    .select('*')
    .eq('environment_id', environmentId)
    .eq('token_prefix', tokenPrefix)
    .is('revoked_at', null)
    .gt('expires_at', nowIso());
  assertNoError(error, 'Failed to validate mobile deployment CI token');

  for (const row of (data ?? []) as MobileDeploymentCiTokenRow[]) {
    if (!row.platforms.includes(platform)) {
      continue;
    }

    if (await validateApiKeyHash(token, row.token_hash)) {
      return row;
    }
  }

  throw new MobileDeploymentStoreError('Unauthorized', 401, 'invalid_token');
}

async function recordBundleFetch({
  claims,
  db,
  environmentId,
  failureCode,
  platform,
  requestIp,
  success,
  tokenId,
  versionId,
}: {
  claims: MobileDeploymentGitHubOidcClaims | null;
  db: AdminClient;
  environmentId: string;
  failureCode?: string;
  platform: MobileDeploymentPlatform;
  requestIp: string | null;
  success: boolean;
  tokenId?: string | null;
  versionId?: string | null;
}) {
  const { error } = await privateDb(db)
    .from('mobile_deployment_bundle_fetches')
    .insert({
      environment_id: environmentId,
      failure_code: failureCode ?? null,
      github_actor: claims?.actor ?? null,
      github_run_attempt: claims?.runAttempt ?? null,
      github_run_id: claims?.runId ?? null,
      github_sha: claims?.sha ?? null,
      github_workflow_ref: claims?.workflowRef ?? null,
      platform,
      request_ip: requestIp,
      success,
      token_id: tokenId ?? null,
      version_id: versionId ?? null,
    });

  if (error) {
    console.warn('Failed to record mobile deployment bundle fetch:', error);
  }
}

async function assertNoReplay({
  claims,
  db,
  environmentId,
  platform,
  tokenId,
}: {
  claims: MobileDeploymentGitHubOidcClaims;
  db: AdminClient;
  environmentId: string;
  platform: MobileDeploymentPlatform;
  tokenId: string;
}) {
  const { data, error } = await privateDb(db)
    .from('mobile_deployment_bundle_fetches')
    .select('id')
    .eq('environment_id', environmentId)
    .eq('token_id', tokenId)
    .eq('platform', platform)
    .eq('github_run_id', claims.runId)
    .eq('github_run_attempt', claims.runAttempt)
    .eq('success', true)
    .limit(1);
  assertNoError(error, 'Failed to inspect mobile deployment bundle fetches');

  if (data?.length) {
    throw new MobileDeploymentStoreError(
      'Unauthorized',
      401,
      'replay_detected'
    );
  }
}

async function buildBundle({
  db,
  platform,
  version,
}: {
  db: AdminClient;
  platform: MobileDeploymentPlatform;
  version: MobileDeploymentVersionRow;
}) {
  const [secrets, files] = await Promise.all([
    listSecretsForVersion(db, version.id),
    listFilesForVersion(db, version.id),
  ]);
  const readinessErrors = evaluateVersionReadiness(version, secrets, files);
  if (readinessErrors.length) {
    throw new MobileDeploymentStoreError(
      'Mobile deployment version is not ready',
      409,
      'version_not_ready'
    );
  }

  const dataKey = await decryptDataKey(version.data_key_ciphertext);
  const envValues: Record<string, string> = {};
  const scalarValues: Partial<Record<MobileDeploymentScalarName, string>> = {};
  const scalarIds: Record<MobileDeploymentScalarName, string | undefined> =
    Object.fromEntries(
      MOBILE_DEPLOYMENT_SCALAR_NAMES.map((name) => [name, undefined])
    ) as Record<MobileDeploymentScalarName, string | undefined>;

  for (const secret of secrets) {
    const value = decryptSecretValue(secret.encrypted_value, dataKey);
    if (secret.kind === 'env') {
      envValues[secret.name] = value;
    } else {
      const name = secret.name as MobileDeploymentScalarName;
      scalarValues[name] = value;
      scalarIds[name] = secret.id;
    }
  }

  for (const scalar of requiredScalarsForPlatform(platform)) {
    if (!scalarValues[scalar]) {
      throw new MobileDeploymentStoreError(
        'Mobile deployment scalar is missing',
        409,
        'version_not_ready'
      );
    }
  }

  const filesByKind = new Map(files.map((file) => [file.kind, file]));
  const bundleFiles: MobileDeploymentBundle['files'] = {};
  const fileIds: MobileDeploymentBundle['resourceVersionIds']['files'] =
    Object.fromEntries(
      [...ANDROID_REQUIRED_FILE_KINDS, ...IOS_REQUIRED_FILE_KINDS].map(
        (kind) => [kind, undefined]
      )
    ) as MobileDeploymentBundle['resourceVersionIds']['files'];

  for (const kind of requiredFilesForPlatform(platform)) {
    const file = filesByKind.get(kind);
    if (!file) {
      throw new MobileDeploymentStoreError(
        'Mobile deployment file is missing',
        409,
        'version_not_ready'
      );
    }

    const encrypted = await downloadWorkspaceStorageObjectForProvider(
      ROOT_WORKSPACE_ID,
      file.storage_provider,
      file.storage_path,
      { allowReservedMobileDeploymentVault: true }
    );
    if (sha256Hex(encrypted.buffer) !== file.ciphertext_sha256) {
      throw new MobileDeploymentStoreError(
        'Mobile deployment encrypted file integrity check failed',
        409,
        'integrity_check_failed'
      );
    }

    const plaintext = decryptBytes(encrypted.buffer, dataKey);
    if (sha256Hex(plaintext) !== file.plaintext_sha256) {
      throw new MobileDeploymentStoreError(
        'Mobile deployment plaintext file integrity check failed',
        409,
        'integrity_check_failed'
      );
    }

    bundleFiles[kind] = {
      base64: Buffer.from(plaintext).toString('base64'),
      contentType: file.content_type,
      filename: file.filename,
      kind,
      sha256: file.plaintext_sha256,
      size: file.plaintext_size,
    };
    fileIds[kind] = file.id;
  }

  if (platform === 'android') {
    scalarValues.GOOGLE_PLAY_PACKAGE_NAME = EXPECTED_ANDROID_PACKAGE_NAME;
    // Use the operator-selected track; fall back to the default if unset.
    scalarValues.GOOGLE_PLAY_TRACK ??= GOOGLE_PLAY_TRACK;
  } else {
    scalarValues.APPLE_BUNDLE_ID = EXPECTED_IOS_BUNDLE_ID;
  }

  return {
    environment: MOBILE_DEPLOYMENT_ENVIRONMENT,
    envFile: renderEnvFile(envValues),
    files: bundleFiles,
    platform,
    resourceVersionIds: {
      files: fileIds,
      scalars: scalarIds,
    },
    scalarValues,
    versionId: version.id,
    versionNumber: version.version,
  } satisfies MobileDeploymentBundle;
}

export async function fetchMobileDeploymentBundle({
  claims,
  db,
  platform,
  requestIp,
  token,
}: {
  claims: MobileDeploymentGitHubOidcClaims;
  db: AdminClient;
  platform: MobileDeploymentPlatform;
  requestIp: string | null;
  token: string;
}) {
  const environment = await getProductionEnvironment(db);
  let tokenRow: MobileDeploymentCiTokenRow | null = null;

  try {
    tokenRow = await validateCiToken({
      db,
      environmentId: environment.id,
      platform,
      token,
    });
    await assertNoReplay({
      claims,
      db,
      environmentId: environment.id,
      platform,
      tokenId: tokenRow.id,
    });

    const activeVersion = await getVersionById(
      db,
      environment.active_version_id
    );
    if (!activeVersion) {
      throw new MobileDeploymentStoreError(
        'Mobile deployment has no active version',
        409,
        'no_active_version'
      );
    }

    const bundle = await buildBundle({ db, platform, version: activeVersion });
    const { error: tokenUpdateError } = await privateDb(db)
      .from('mobile_deployment_ci_tokens')
      .update({
        last_used_at: nowIso(),
        last_used_github_run_attempt: claims.runAttempt,
        last_used_github_run_id: claims.runId,
        last_used_platform: platform,
      })
      .eq('id', tokenRow.id);
    assertNoError(
      tokenUpdateError,
      'Failed to update mobile deployment token usage'
    );

    await recordBundleFetch({
      claims,
      db,
      environmentId: environment.id,
      platform,
      requestIp,
      success: true,
      tokenId: tokenRow.id,
      versionId: activeVersion.id,
    });
    await recordAudit(db, {
      actorType: 'ci',
      environmentId: environment.id,
      eventType: 'bundle.fetched',
      metadata: {
        githubRunAttempt: claims.runAttempt,
        githubRunId: claims.runId,
        platform,
        workflowRef: claims.workflowRef,
      },
      tokenId: tokenRow.id,
      versionId: activeVersion.id,
    });

    return bundle;
  } catch (error) {
    await recordBundleFetch({
      claims,
      db,
      environmentId: environment.id,
      failureCode:
        error instanceof MobileDeploymentStoreError
          ? error.code
          : 'bundle_fetch_failed',
      platform,
      requestIp,
      success: false,
      tokenId: tokenRow?.id,
      versionId: environment.active_version_id,
    });
    throw error;
  }
}

export async function recordAudit(
  db: AdminClient,
  {
    actorType,
    actorUserId = null,
    environmentId,
    eventType,
    metadata = {},
    resourceKind = null,
    tokenId = null,
    versionId = null,
  }: {
    actorType: 'ci' | 'user';
    actorUserId?: string | null;
    environmentId: string;
    eventType: string;
    metadata?: Json;
    resourceKind?: string | null;
    tokenId?: string | null;
    versionId?: string | null;
  }
) {
  const { error } = await privateDb(db)
    .from('mobile_deployment_audit_events')
    .insert({
      actor_type: actorType,
      actor_user_id: actorUserId,
      environment_id: environmentId,
      event_type: eventType,
      metadata,
      resource_kind: resourceKind,
      token_id: tokenId,
      version_id: versionId,
    });

  if (error) {
    console.warn('Failed to record mobile deployment audit event:', error);
  }
}
