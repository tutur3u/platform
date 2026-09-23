import 'server-only';

import { randomUUID } from 'node:crypto';
import { buildMobileDeploymentVaultStoragePath } from '@tuturuuu/storage-core/mobile-deployment/storage-policy';
import {
  deleteWorkspaceStorageObjectByPath,
  downloadWorkspaceStorageObjectForProvider,
  uploadWorkspaceStorageFileDirect,
} from '@tuturuuu/storage-core/workspace-storage-provider';
import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database, Json } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  createEncryptedDataKey,
  decryptBytes,
  decryptDataKey,
  decryptSecretValue,
  encryptBytes,
  encryptSecretValue,
  sha256Hex,
} from './crypto';
import { MobileDeploymentStoreError } from './store-error';
import type {
  MobileDeploymentFileArtifactRow,
  MobileDeploymentSecretValueRow,
  MobileDeploymentVersionRow,
} from './types';

// Narrow rollout contract; generated database types are refreshed after applying
// the migration locally. A missing RPC is a hard failure, never an empty draft.
type AdminClient = SupabaseClient<Database>;
type Draft = MobileDeploymentVersionRow & {
  inheritance_initialized: boolean;
  inheritance_revision: number;
  inherited_from_version_id: string | null;
  inheritance_excluded: string[];
};
export type InheritanceSnapshot = {
  draft: Draft;
  source: Draft | null;
  secrets: MobileDeploymentSecretValueRow[];
  files: MobileDeploymentFileArtifactRow[];
  draftSecrets: MobileDeploymentSecretValueRow[];
  draftFiles: MobileDeploymentFileArtifactRow[];
};

async function rpc(db: AdminClient, name: string, args: Record<string, Json>) {
  const client = db.schema('private') as unknown as {
    rpc: (
      name: string,
      args: Record<string, Json>
    ) => PromiseLike<{
      data: unknown;
      error: { code?: string } | null;
    }>;
  };
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const conflict = error.code === '40001' || error.code === '40P01';
    throw new MobileDeploymentStoreError(
      conflict
        ? 'Vault changed during inheritance. Refresh and retry.'
        : 'Vault inheritance is unavailable. Check the database migration and retry.',
      conflict ? 409 : 503,
      'vault_inheritance_unavailable'
    );
  }
  return data;
}

export async function excludeDraftInheritance(
  db: AdminClient,
  versionId: string,
  key: string
) {
  await rpc(db, 'mobile_deployment_exclude_inheritance', {
    p_version: versionId,
    p_key: key,
  });
}

/** Preparation never mutates draft rows. Each upload has its own immutable path,
 * so a competing resource update cannot be overwritten before the CAS commit. */
export async function prepareInheritance(
  snapshot: InheritanceSnapshot,
  dependencies = {
    decryptDataKey,
    download: downloadWorkspaceStorageObjectForProvider,
    upload: uploadWorkspaceStorageFileDirect,
  }
) {
  const { draft, source } = snapshot;
  if (!source) return { secrets: [], files: [] };
  const sourceKey = await dependencies.decryptDataKey(
    source.data_key_ciphertext
  );
  const draftKey = await dependencies.decryptDataKey(draft.data_key_ciphertext);
  const attemptedPaths: string[] = [];
  try {
    const exclusions = new Set(draft.inheritance_excluded);
    const currentSecrets = new Set(
      snapshot.draftSecrets.map((row) => `${row.kind}:${row.name}`)
    );
    const currentFiles = new Set(snapshot.draftFiles.map((row) => row.kind));
    const secrets = snapshot.secrets
      .filter((row) => {
        const key = `${row.kind}:${row.name}`;
        return (
          !currentSecrets.has(key) &&
          !exclusions.has(key) &&
          !exclusions.has(`${row.kind}:*`)
        );
      })
      .map((row) => {
        const plaintext = decryptSecretValue(row.encrypted_value, sourceKey);
        if (sha256Hex(plaintext) !== row.plaintext_sha256) {
          throw new MobileDeploymentStoreError(
            'Vault secret integrity check failed',
            409
          );
        }
        return {
          ...row,
          encrypted_value: encryptSecretValue(plaintext, draftKey),
        };
      });
    const files: MobileDeploymentFileArtifactRow[] = [];
    for (const row of snapshot.files) {
      if (currentFiles.has(row.kind)) continue;
      const downloaded = await dependencies.download(
        ROOT_WORKSPACE_ID,
        row.storage_provider,
        row.storage_path,
        { allowReservedMobileDeploymentVault: true }
      );
      if (sha256Hex(downloaded.buffer) !== row.ciphertext_sha256) {
        throw new MobileDeploymentStoreError(
          'Vault encrypted file integrity check failed',
          409
        );
      }
      const plaintext = decryptBytes(downloaded.buffer, sourceKey);
      try {
        if (sha256Hex(plaintext) !== row.plaintext_sha256) {
          throw new MobileDeploymentStoreError(
            'Vault file integrity check failed',
            409
          );
        }
        const encrypted = encryptBytes(plaintext, draftKey);
        const path = buildMobileDeploymentVaultStoragePath(
          draft.id,
          `inherit-${randomUUID()}-${row.kind}.ciphertext.json`
        );
        attemptedPaths.push(path);
        const uploaded = await dependencies.upload(
          ROOT_WORKSPACE_ID,
          path,
          encrypted,
          {
            allowReservedMobileDeploymentVault: true,
            contentType: 'application/json',
            upsert: false,
          }
        );
        if (uploaded.provider !== 'r2' && uploaded.provider !== 'supabase') {
          throw new MobileDeploymentStoreError(
            'Vault storage provider is invalid',
            502
          );
        }
        files.push({
          ...row,
          storage_path: uploaded.path,
          storage_provider: uploaded.provider,
          ciphertext_sha256: sha256Hex(encrypted),
          ciphertext_size: encrypted.byteLength,
        });
      } finally {
        plaintext.fill(0);
      }
    }
    return { secrets, files };
  } catch (error) {
    // Preparation has not committed any metadata, so these unique attempt paths
    // cannot be referenced by a successful repair or a simultaneous upload.
    await Promise.allSettled(
      attemptedPaths.map((path) =>
        deleteWorkspaceStorageObjectByPath(ROOT_WORKSPACE_ID, path, {
          allowReservedMobileDeploymentVault: true,
        })
      )
    );
    throw error;
  } finally {
    sourceKey.fill(0);
    draftKey.fill(0);
  }
}

export async function inheritDraft(
  db: AdminClient,
  versionId: string,
  userId: string | null
) {
  const snapshot = (await rpc(db, 'mobile_deployment_inheritance_snapshot', {
    p_version: versionId,
  })) as InheritanceSnapshot;
  if (snapshot.draft.inherited_from_version_id) return;
  const prepared = await prepareInheritance(snapshot);
  await rpc(db, 'mobile_deployment_commit_inheritance', {
    p_version: versionId,
    p_source: snapshot.source?.id ?? null,
    p_revision: snapshot.draft.inheritance_revision,
    p_user: userId,
    p_secrets: prepared.secrets as unknown as Json,
    p_files: prepared.files as unknown as Json,
  });
}

export async function getOrCreateDraftVersion(
  db: AdminClient,
  environmentId: string,
  userId: string | null
) {
  const schema = db.schema('private');
  const { data: existing, error: readError } = await schema
    .from('mobile_deployment_versions')
    .select('*')
    .eq('environment_id', environmentId)
    .eq('status', 'draft')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError)
    throw new MobileDeploymentStoreError('Failed to load vault draft', 503);
  let draft = existing as Draft | null;
  if (!draft) {
    const { data: latest, error } = await schema
      .from('mobile_deployment_versions')
      .select('version')
      .eq('environment_id', environmentId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error)
      throw new MobileDeploymentStoreError(
        'Failed to inspect vault versions',
        503
      );
    const { encryptedDataKey, dataKey } = await createEncryptedDataKey();
    dataKey.fill(0);
    const result = await schema
      .from('mobile_deployment_versions')
      .insert({
        environment_id: environmentId,
        created_by: userId,
        data_key_ciphertext: encryptedDataKey,
        status: 'draft',
        version: Number(latest?.version ?? 0) + 1,
      })
      .select('*')
      .single();
    if (result.error)
      throw new MobileDeploymentStoreError(
        'Vault changed. Refresh and retry.',
        409
      );
    draft = result.data as Draft;
  }
  if (typeof draft.inheritance_initialized !== 'boolean') {
    throw new MobileDeploymentStoreError(
      'Vault inheritance database migration is required',
      503
    );
  }
  if (!draft.inheritance_initialized) await inheritDraft(db, draft.id, userId);
  return draft;
}
