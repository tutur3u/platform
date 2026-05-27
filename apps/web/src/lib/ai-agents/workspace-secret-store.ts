import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { SecretRow } from './registry-codec';

export async function getDb(db?: TypedSupabaseClient) {
  return db ?? ((await createAdminClient()) as TypedSupabaseClient);
}

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

  return (data ?? []) as SecretRow[];
}

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
