import { createClient } from '@tuturuuu/supabase/next/server';

export async function isPromotionAllowedForWorkspace(
  wsId: string,
  isSubscriptionInvoice: boolean = false
): Promise<boolean> {
  // Always allowed for subscription invoices
  if (isSubscriptionInvoice) {
    return true;
  }

  const supabase = await createClient();
  const { data: config } = await supabase
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', wsId)
    .eq('id', 'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD')
    .single();

  // Default to true for backward compatibility
  return config?.value?.toLowerCase() !== 'false';
}

/**
 * Returns true if the given group ID is blocked from having subscription invoices created.
 * Configuration is stored in workspace_configs as a comma-separated list of UUIDs:
 *   id = 'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION'
 */
export async function isGroupBlockedForSubscriptionInvoices(
  wsId: string,
  groupId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { data: config } = await supabase
    .from('workspace_configs')
    .select('value')
    .eq('ws_id', wsId)
    .eq('id', 'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION')
    .single();

  const raw = config?.value;
  if (!raw) {
    return false;
  }

  // Normalize and split into UUID list
  const ids = raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  return ids.includes(groupId);
}
