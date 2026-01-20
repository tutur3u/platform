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
