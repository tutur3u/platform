import type { StoredAudit } from '@tuturuuu/feature-flags';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  asPrivateRpcAdmin,
  readPlatformFeatureFlagAudit,
  readPlatformFeatureFlagState,
} from '@/lib/feature-flags/platform-feature-flag-store';
import type {
  FeatureFlagStorageSnapshot,
  FeatureFlagStoredOverride,
} from './read-model';

export async function loadFeatureFlagDashboardSnapshot(
  actorId: string
): Promise<FeatureFlagStorageSnapshot> {
  const admin = asPrivateRpcAdmin(await createAdminClient({ noCookie: true }));
  const read = await readPlatformFeatureFlagState({ actorId, admin });
  if (read.status !== 'ready') return { status: 'unavailable' };
  const overrides: FeatureFlagStoredOverride[] = read.overrides.map((row) => ({
    environment: row.environment,
    flagKey: row.flagKey,
    overrideEnabled: row.overrideEnabled,
    revision: row.revision,
  }));
  return { overrides, status: 'ready' };
}

export async function loadFeatureFlagAudit(
  actorId: string
): Promise<
  { rows: StoredAudit[]; status: 'ready' } | { status: 'unavailable' }
> {
  const admin = asPrivateRpcAdmin(await createAdminClient({ noCookie: true }));
  const read = await readPlatformFeatureFlagAudit({
    actorId,
    admin,
    limit: 50,
  });
  if (read.status !== 'ready') return { status: 'unavailable' };
  return read;
}
