import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getWorkspaceSecretTier } from '@tuturuuu/utils/workspace-secret-policy';
import type { WorkspaceSecretRevealPurpose } from '@tuturuuu/utils/workspace-secrets/protocol';
import {
  getWorkspaceSecretsBinding,
  putWorkspaceCredential,
  revealWorkspaceCredential,
  WorkspaceSecretsUnavailableError,
} from '@tuturuuu/utils/workspace-secrets/runtime';
import type { SecretRow } from './registry-codec';

export async function getDb(db?: TypedSupabaseClient) {
  return db ?? ((await createAdminClient()) as TypedSupabaseClient);
}

function isCredentialName(name: string) {
  return getWorkspaceSecretTier(name) === 'credential';
}

/**
 * Registry rows under `prefix`. With the secrets Worker binding, credential
 * values are never returned: those rows carry `stored` instead, so callers
 * can tell a configured credential apart without its plaintext.
 */
export async function readSecretRows({
  db,
  prefix,
}: {
  db?: TypedSupabaseClient;
  prefix: string;
}) {
  const sbAdmin = await getDb(db);
  const { data, error } = await sbAdmin
    .from('workspace_secrets')
    .select('name, value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .like('name', `${prefix}:%`);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as SecretRow[];
  if (!getWorkspaceSecretsBinding()) {
    return rows;
  }

  return rows.map((row): SecretRow =>
    isCredentialName(row.name)
      ? {
          name: row.name,
          // An encrypted row holds NULL; a legacy row holds its plaintext.
          stored: row.value === null || row.value.length > 0,
          value: null,
        }
      : row
  );
}

async function replaceSecretRowsLegacy(
  sbAdmin: TypedSupabaseClient,
  names: string[],
  rows: SecretRow[]
) {
  if (names.length > 0) {
    const { error: deleteError } = await sbAdmin
      .from('workspace_secrets')
      .delete()
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .in('name', names);

    if (deleteError) {
      throw new Error(deleteError.message);
    }
  }

  if (rows.length === 0) {
    return;
  }

  const { error } = await sbAdmin.from('workspace_secrets').insert(
    rows.map((row) => ({
      name: row.name,
      value: row.value,
      ws_id: ROOT_WORKSPACE_ID,
    }))
  );

  if (error) {
    throw new Error(error.message);
  }
}

type CredentialRevision = { id: string; valueRev: number };

async function readCredentialRevisions(
  sbAdmin: TypedSupabaseClient,
  names: string[]
) {
  const revisions = new Map<string, CredentialRevision>();
  if (names.length === 0) {
    return revisions;
  }

  const { data, error } = await sbAdmin
    .from('workspace_secrets')
    .select('id, name, value_rev')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .in('name', names);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of data ?? []) {
    revisions.set(row.name, { id: row.id, valueRev: row.value_rev });
  }
  return revisions;
}

async function putRootCredential(
  row: { name: string; value: string },
  existing: CredentialRevision | undefined
) {
  const result = await putWorkspaceCredential({
    ...(existing
      ? { expectedValueRev: existing.valueRev, secretId: existing.id }
      : {}),
    // Only reached when the binding disappears mid-request: fail closed.
    legacyWrite: async () => ({ status: 'unavailable' }),
    name: row.name,
    value: row.value,
    wsId: ROOT_WORKSPACE_ID,
  });

  if (result.status !== 'ok') {
    throw new WorkspaceSecretsUnavailableError(result.status);
  }
}

/**
 * Deletes `names` and writes `rows`. Without the secrets Worker binding this
 * is a plaintext delete-and-insert. With it, config rows keep that path while
 * credential rows are written through the Worker (replaced in place when the
 * row exists) and credential names with no new value are deleted directly.
 */
export async function replaceSecretRows({
  db,
  rows,
  names,
}: {
  db?: TypedSupabaseClient;
  names: string[];
  rows: SecretRow[];
}) {
  const sbAdmin = await getDb(db);

  if (!getWorkspaceSecretsBinding()) {
    return replaceSecretRowsLegacy(sbAdmin, names, rows);
  }

  const credentialRows = rows.filter(
    (row): row is SecretRow & { value: string } =>
      isCredentialName(row.name) && typeof row.value === 'string'
  );
  const credentialRowNames = new Set(credentialRows.map((row) => row.name));
  const configRows = rows.filter((row) => !isCredentialName(row.name));
  const configNames = names.filter((name) => !isCredentialName(name));
  const removedCredentialNames = names.filter(
    (name) => isCredentialName(name) && !credentialRowNames.has(name)
  );

  await replaceSecretRowsLegacy(sbAdmin, configNames, configRows);

  const revisions = await readCredentialRevisions(sbAdmin, [
    ...credentialRowNames,
  ]);
  for (const row of credentialRows) {
    await putRootCredential(row, revisions.get(row.name));
  }

  if (removedCredentialNames.length > 0) {
    const { error } = await sbAdmin
      .from('workspace_secrets')
      .delete()
      .eq('ws_id', ROOT_WORKSPACE_ID)
      .in('name', removedCredentialNames);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function getRootSecretValue(
  name: string,
  db?: TypedSupabaseClient
) {
  const sbAdmin = await getDb(db);
  const { data, error } = await sbAdmin
    .from('workspace_secrets')
    .select('value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .eq('name', name)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.value ?? null;
}

/**
 * A credential-tier root secret for a server use: revealed by the secrets
 * Worker when its binding is installed, otherwise read as plaintext.
 */
export async function revealRootCredential(
  name: string,
  purpose: WorkspaceSecretRevealPurpose,
  db?: TypedSupabaseClient
) {
  return revealWorkspaceCredential({
    legacyRead: () => getRootSecretValue(name, db),
    name,
    purpose,
    wsId: ROOT_WORKSPACE_ID,
  });
}
