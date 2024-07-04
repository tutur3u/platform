import { CustomDataTable } from '@/components/custom-data-table';
import { invoiceColumns } from '@/data/columns/invoices';
import { verifyHasSecrets } from '@/lib/workspace-helper';
import { Invoice } from '@/types/primitives/Invoice';
import { createClient } from '@/utils/supabase/server';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
  };
}

export default async function WorkspaceInvoicesPage({
  params: { wsId },
  searchParams,
}: Props) {
  await verifyHasSecrets(wsId, ['ENABLE_INVOICES'], `/${wsId}`);
  const { data, count } = await getData(wsId, searchParams);

  return (
    <CustomDataTable
      data={data}
      columnGenerator={invoiceColumns}
      namespace="invoice-data-table"
      count={count}
      defaultVisibility={{
        id: false,
        customer_id: false,
        price: false,
        total_diff: false,
        note: false,
      }}
    />
  );
}

async function getData(
  wsId: string,
  {
    q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = createClient();

  const queryBuilder = supabase
    .from('finance_invoices')
    .select('*, customer:workspace_users!customer_id(full_name)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  if (q) queryBuilder.ilike('name', `%${q}%`);

  if (page && pageSize) {
    const parsedPage = parseInt(page);
    const parsedSize = parseInt(pageSize);
    const start = (parsedPage - 1) * parsedSize;
    const end = parsedPage * parsedSize;
    queryBuilder.range(start, end).limit(parsedSize);
  }

  const { data: rawData, error, count } = await queryBuilder;
  if (error) throw error;

  const data = rawData.map(({ customer, ...rest }) => ({
    ...rest,
    // @ts-expect-error
    customer: customer?.full_name || '-',
  }));

  return { data, count } as { data: Invoice[]; count: number };
}
