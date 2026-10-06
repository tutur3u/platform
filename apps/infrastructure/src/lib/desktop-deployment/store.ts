import 'server-only';

import type {
  DesktopVaultState,
  DesktopVaultVersion,
} from '@tuturuuu/internal-api/infrastructure';
import type { DesktopAdminDb } from './access';
import { desktopVaultEnabled } from './contract';

export class DesktopAdminStoreError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super('Desktop administration rejected');
  }
}

export function requireDesktopResult(error: { code?: string } | null): void {
  if (!error) return;
  if (error.code === '42501')
    throw new DesktopAdminStoreError(403, 'desktop_forbidden');
  if (error.code === '40001' || error.code === '23505')
    throw new DesktopAdminStoreError(409, 'desktop_revision_conflict');
  if (error.code === 'P0002')
    throw new DesktopAdminStoreError(404, 'desktop_version_not_found');
  throw new DesktopAdminStoreError(500, 'desktop_storage_unavailable');
}

export async function listDesktopVaultState(
  db: DesktopAdminDb
): Promise<DesktopVaultState> {
  const privateDb = db.schema('private');
  const [environments, versions, tokens] = await Promise.all([
    privateDb
      .from('desktop_deployment_environments')
      .select('platform,enabled,active_version_id')
      .order('platform'),
    privateDb
      .from('desktop_deployment_versions')
      .select(
        'id,platform,version,status,revision,validated_revision,validation_errors,created_at'
      )
      .in('status', ['draft', 'active'])
      .order('platform'),
    privateDb
      .from('desktop_deployment_ci_tokens')
      .select('id,platform,version_id,token_prefix,expires_at,revoked_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  for (const result of [environments, versions, tokens])
    requireDesktopResult(result.error);
  const ids = (versions.data ?? []).map((row) => row.id);
  const resources = ids.length
    ? await privateDb
        .from('desktop_deployment_resources')
        .select('version_id,name')
        .in('version_id', ids)
    : { data: [], error: null };
  requireDesktopResult(resources.error);
  // Reconstruct each DTO: never spread a private row into a public response.
  return {
    deliveryEnabled: desktopVaultEnabled(
      process.env.DESKTOP_DEPLOYMENT_VAULT_ENABLED
    ),
    platforms: (environments.data ?? []).map((row) => ({
      platform: row.platform as 'windows' | 'macos',
      enabled: row.enabled,
      activeVersionId: row.active_version_id,
    })),
    versions: (versions.data ?? []).map(
      (row): DesktopVaultVersion => ({
        id: row.id,
        platform: row.platform as 'windows' | 'macos',
        version: row.version,
        status: row.status as 'draft' | 'active',
        revision: row.revision,
        validatedRevision: row.validated_revision,
        validationErrors: row.validation_errors,
        createdAt: row.created_at,
        resources: (resources.data ?? [])
          .filter((resource) => resource.version_id === row.id)
          .map((resource) => resource.name),
      })
    ),
    tokens: (tokens.data ?? []).map((row) => ({
      id: row.id,
      platform: row.platform as 'windows' | 'macos',
      versionId: row.version_id,
      prefix: row.token_prefix,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
    })),
  };
}
