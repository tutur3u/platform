import 'server-only';

import {
  featureFlagCatalog,
  type PrivateRpcAdmin,
  runtimeDefinitionRows,
} from '@tuturuuu/feature-flags';
import { z } from 'zod';

const summary = z.object({
  status: z.literal('synced'),
  definitions: z.number().int().nonnegative(),
  changed: z.number().int().nonnegative(),
});

export async function syncFeatureFlagDefinitions(
  admin: PrivateRpcAdmin,
  acknowledgeWidening = false
) {
  try {
    const { data, error } = await admin
      .schema('private')
      .rpc('feature_flag_sync_definitions', {
        p_definitions: runtimeDefinitionRows(featureFlagCatalog.flags),
        p_acknowledge_widening: acknowledgeWidening,
      });
    if (error?.message === 'feature_flag_definition_widens_control') {
      return { status: 'widening' as const };
    }
    const parsed = error ? null : summary.safeParse(data);
    if (parsed?.success)
      return { status: 'synced' as const, summary: parsed.data };
  } catch {
    // Transport failures and invalid responses have the same public outcome.
  }
  return { status: 'unavailable' as const };
}

let bootSyncStarted = false;

export function startFeatureFlagDefinitionSync(admin: PrivateRpcAdmin) {
  if (bootSyncStarted) return;
  bootSyncStarted = true;
  void syncFeatureFlagDefinitions(admin).then((result) => {
    if (result.status !== 'synced') {
      console.warn('Feature flag definition sync did not complete', {
        status: result.status,
      });
    }
  });
}
