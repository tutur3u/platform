import 'server-only';

import { createAdminClient } from '@tuturuuu/supabase/next/server';

/**
 * Resolve a workspace's default currency from the shared `DEFAULT_CURRENCY`
 * workspace config. Used as the server-side fallback when inventory storefronts
 * (and the auto-provisioned default storefront) are created without an explicit
 * currency, so they inherit the workspace setting instead of a hard-coded USD.
 */
export async function getWorkspaceDefaultCurrency(
  wsId: string
): Promise<string> {
  try {
    const sbAdmin = await createAdminClient();
    const { data } = await sbAdmin
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', wsId)
      .eq('id', 'DEFAULT_CURRENCY')
      .maybeSingle();

    const value = (data as { value?: string | null } | null)?.value?.trim();
    return value ? value.toUpperCase() : 'USD';
  } catch {
    return 'USD';
  }
}
