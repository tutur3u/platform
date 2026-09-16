import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
  withFinanceApiBaseUrl,
} from './client';

export interface InvoiceHistoryEntry {
  id: string;
  occurred_at: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';
  invoice_id: string;
  actor_id: string | null;
  actor_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  changed_fields: string[];
  changes: Record<string, { before: string | null; after: string | null }>;
  can_restore: boolean;
}

export function getInvoiceHistory(
  workspaceId: string,
  query: {
    q?: string;
    invoiceId?: string;
    deletedOnly?: boolean;
    offset?: number;
    limit?: number;
  },
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withFinanceApiBaseUrl(options)).json<{
    data: InvoiceHistoryEntry[];
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/history`,
    { query, cache: 'no-store' }
  );
}

export function restoreInvoice(
  workspaceId: string,
  invoiceId: string,
  options?: InternalApiClientOptions
) {
  return getInternalApiClient(withFinanceApiBaseUrl(options)).json<{
    message: string;
  }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/${encodePathSegment(invoiceId)}/restore`,
    { method: 'POST' }
  );
}

export async function deleteInvoice(
  workspaceId: string,
  invoiceId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(withFinanceApiBaseUrl(options));
  return client.json<{ message: string }>(
    `/api/v1/workspaces/${encodePathSegment(workspaceId)}/finance/invoices/${encodePathSegment(invoiceId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
    }
  );
}
