import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { WorkspaceStorageError } from './storage-download-error';

function markerPath(wsId: string, folderPath: string) {
  const folderHash = createHash('sha256').update(folderPath).digest('hex');
  return `${wsId}/.tuturuuu/drive-export-revocations/${folderHash}`;
}

export async function readExportRevocationVersion(
  wsId: string,
  folderPath: string
) {
  const supabase = await createDynamicAdminClient();
  const { data, error } = await supabase.storage
    .from('workspaces')
    .download(
      markerPath(wsId, folderPath),
      { cacheNonce: randomUUID() },
      { cache: 'no-store' }
    );
  if (error) {
    if ('statusCode' in error && String(error.statusCode) === '404')
      return null;
    throw new WorkspaceStorageError(
      'Export link verification unavailable.',
      503
    );
  }
  if (!data) {
    throw new WorkspaceStorageError(
      'Export link verification unavailable.',
      503
    );
  }
  const version = await data.text();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(
      version
    )
  ) {
    throw new WorkspaceStorageError(
      'Export link verification unavailable.',
      503
    );
  }
  return version;
}

export async function getOrCreateExportRevocationVersion(
  wsId: string,
  folderPath: string
) {
  const existing = await readExportRevocationVersion(wsId, folderPath);
  if (existing !== null) return existing;
  const version = randomUUID();
  const supabase = await createDynamicAdminClient();
  const { error } = await supabase.storage
    .from('workspaces')
    .upload(markerPath(wsId, folderPath), version, {
      upsert: false,
      contentType: 'text/plain',
      cacheControl: '0',
    });
  if (!error) return version;
  if ('statusCode' in error && String(error.statusCode) === '409') {
    const winner = await readExportRevocationVersion(wsId, folderPath);
    if (winner !== null) return winner;
  }
  throw new WorkspaceStorageError('Export link verification unavailable.', 503);
}

export async function revokeExportFolder(wsId: string, folderPath: string) {
  const supabase = await createDynamicAdminClient();
  const { error } = await supabase.storage
    .from('workspaces')
    .upload(markerPath(wsId, folderPath), randomUUID(), {
      upsert: true,
      contentType: 'text/plain',
      cacheControl: '0',
    });
  if (error) {
    throw new WorkspaceStorageError('Export link revocation unavailable.', 503);
  }
}
