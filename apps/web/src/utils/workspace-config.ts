import { getWorkspaceConfig } from '@/lib/workspace-helper';

export async function isPromotionAllowedForWorkspace(
  wsId: string,
  isSubscriptionInvoice: boolean = false
): Promise<boolean> {
  // Always allowed for subscription invoices
  if (isSubscriptionInvoice) {
    return true;
  }

  const value = await getWorkspaceConfig(
    wsId,
    'INVOICE_ALLOW_PROMOTIONS_FOR_STANDARD'
  );

  // Default to true for backward compatibility
  return value?.toLowerCase() !== 'false';
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
  const value = await getWorkspaceConfig(
    wsId,
    'INVOICE_BLOCKED_GROUP_IDS_FOR_CREATION'
  );

  if (!value) {
    return false;
  }

  // Normalize and split into UUID list
  const ids = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  return ids.includes(groupId);
}
