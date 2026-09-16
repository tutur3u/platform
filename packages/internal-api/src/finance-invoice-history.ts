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
  entity_type: 'invoice' | 'product' | 'promotion' | 'group' | 'payment';
  invoice_id: string;
  actor_id: string | null;
  actor_name: string | null;
  customer_id: string | null;
  customer_name: string | null;
  amount: number | null;
  currency: string | null;
  is_deleted: boolean;
  changed_fields: string[];
  changes: Record<
    string,
    {
      before: string | number | boolean | null;
      after: string | number | boolean | null;
    }
  >;
  can_restore: boolean;
}

export function getInvoiceHistory(
  workspaceId: string,
  query: {
    entity?: InvoiceHistoryEntry['entity_type'];
    action?: InvoiceHistoryEntry['operation'];
    from?: string;
    to?: string;
    sort?: 'asc' | 'desc';
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
