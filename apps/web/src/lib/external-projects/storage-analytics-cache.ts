import 'server-only';

import { createDynamicAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';

const highlight = z.object({
  name: z.string(),
  size: z.number().nonnegative(),
  createdAt: z.string(),
});
const analytics = z.object({
  totalSize: z.number().nonnegative(),
  fileCount: z.number().int().nonnegative(),
  scannedObjectLimit: z.number().int().positive(),
  truncated: z.boolean(),
  largestFile: highlight.nullable(),
  smallestFile: highlight.nullable(),
});
export type CachedProjectStorageAnalytics = z.infer<typeof analytics>;

export async function getCachedProjectStorageAnalytics(
  workspaceId: string,
  adapter: string
): Promise<CachedProjectStorageAnalytics | null> {
  const admin = await createDynamicAdminClient();
  const { data, error } = await admin.rpc(
    'get_external_project_storage_analytics',
    {
      p_ws_id: workspaceId,
      p_adapter: adapter,
    }
  );
  if (error?.code === 'PGRST202' || error?.code === '42883') return null;
  if (error) throw new Error(error.message);
  return data === null ? null : analytics.parse(data);
}
