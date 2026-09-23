import {
  listFinanceInvoices,
  listPendingFinanceInvoices,
} from '@tuturuuu/internal-api/finance';
import { IncompleteInvoiceExportError } from './export-pagination';

/**
 * Shape of invoice data as exported to CSV/Excel
 * Flattened structure with complex objects decomposed into primitive fields
 */
export interface InvoiceExportRow {
  // Common fields
  id: string;
  ws_id: string;
  created_at: string;
  notice?: string;
  note?: string;
  price?: number | string;
  total_diff?: number | string;

  // Flattened customer fields
  customer_name?: string;
  customer_avatar_url?: string;

  // Flattened creator fields (created invoices only)
  creator_name?: string;
  creator_email?: string;
  creator_id?: string;

  // Flattened wallet fields (created invoices only)
  wallet_name?: string;

  // Pending invoice specific fields
  user_id?: string;
  user_name?: string;
  user_avatar_url?: string;
  group_id?: string;
  group_name?: string;
  months_owed?: string;
  attendance_days?: number;
  total_sessions?: number;
  potential_total?: number | string;
}

type PendingInvoiceExportData = {
  attendance_days: number;
  group_id: string;
  group_name: string;
  months_owed: string;
  potential_total: number;
  total_sessions: number;
  user_avatar_url: string;
  user_id: string;
  user_name: string;
  customer: {
    full_name: string;
    avatar_url: string;
  } | null;
  creator: null;
  wallet: null;
};

export type CreatedInvoiceExportData = InvoiceExportRow & {
  customer?: {
    full_name?: string | null;
    avatar_url?: string | null;
  } | null;
  creator?: {
    display_name?: string | null;
    full_name?: string | null;
    email?: string | null;
  } | null;
  wallet?: {
    name?: string | null;
  } | null;
};

type PendingInvoiceApiRow = Omit<
  PendingInvoiceExportData,
  'creator' | 'customer' | 'group_id' | 'group_name' | 'months_owed' | 'wallet'
> & {
  group_id?: string | null;
  group_ids?: string[] | null;
  group_name?: string | null;
  group_names?: string[] | null;
  months_owed?: string | string[] | null;
};

function normalizeQueryArray(value?: string | string[]) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

// Helper function to fetch pending invoices data for export
export async function getPendingInvoicesData(
  wsId: string,
  {
    page = '1',
    pageSize = '10',
    q,
    userIds,
    groupByUser = false,
  }: {
    page?: string;
    pageSize?: string;
    q?: string;
    userIds?: string | string[];
    groupByUser?: boolean;
  }
): Promise<{ data: PendingInvoiceExportData[]; count: number }> {
  const payload = await listPendingFinanceInvoices(wsId, {
    groupByUser,
    page,
    pageSize,
    q: q || '',
    userIds: normalizeQueryArray(userIds),
  });

  if (
    !Array.isArray(payload.data) ||
    !Number.isSafeInteger(payload.count) ||
    payload.count < 0
  ) {
    throw new IncompleteInvoiceExportError();
  }
  const rawData = payload.data as PendingInvoiceApiRow[];
  const totalCount = payload.count;

  const transformedData = rawData.map((invoice): PendingInvoiceExportData => {
    const monthsOwed = Array.isArray(invoice.months_owed)
      ? invoice.months_owed.join(', ')
      : typeof invoice.months_owed === 'string'
        ? invoice.months_owed
        : '';

    const baseInvoice = {
      ...invoice,
      attendance_days: invoice.attendance_days ?? 0,
      months_owed: monthsOwed,
      potential_total: invoice.potential_total ?? 0,
      total_sessions: invoice.total_sessions ?? 0,
      user_avatar_url: invoice.user_avatar_url || '',
      user_id: invoice.user_id || '',
      user_name: invoice.user_name || '',
    };

    if (groupByUser) {
      const groupNames = Array.isArray(invoice.group_names)
        ? invoice.group_names.filter(Boolean)
        : [];
      const groupedName = groupNames.join(', ');
      const groupIdValue = Array.isArray(invoice.group_ids)
        ? invoice.group_ids.join(',')
        : '';

      return {
        ...baseInvoice,
        group_id: groupIdValue,
        group_name: groupedName,
        customer: {
          full_name: invoice.user_name || '',
          avatar_url: invoice.user_avatar_url || '',
        },
        creator: null,
        wallet: null,
      };
    }

    return {
      ...baseInvoice,
      group_id: invoice.group_id || '',
      group_name: invoice.group_name || '',
      customer: invoice.user_id
        ? {
            full_name: invoice.user_name || '',
            avatar_url: invoice.user_avatar_url || '',
          }
        : {
            full_name: invoice.group_name || '',
            avatar_url: '',
          },
      creator: null,
      wallet: null,
    };
  });

  return { data: transformedData, count: totalCount };
}

export async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
    start,
    end,
    userIds,
    walletId,
    walletIds,
  }: {
    q?: string;
    page?: string;
    pageSize?: string;
    start?: string;
    end?: string;
    userIds?: string | string[];
    walletId?: string;
    walletIds?: string | string[];
  }
) {
  const walletFilterIds = [
    ...(walletId ? [walletId] : []),
    ...normalizeQueryArray(walletIds),
  ];

  return (await listFinanceInvoices(wsId, {
    end,
    page,
    pageSize,
    q,
    start,
    userIds: normalizeQueryArray(userIds),
    walletIds: walletFilterIds,
  })) as {
    data: CreatedInvoiceExportData[];
    count: number;
  };
}
