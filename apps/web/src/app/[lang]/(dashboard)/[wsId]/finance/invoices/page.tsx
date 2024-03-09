import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';
import { DataTable } from '@/components/ui/custom/tables/data-table';
import { invoiceColumns } from '@/data/columns/invoices';
import { Invoice } from '@/types/primitives/Invoice';
import { getSecrets } from '@/lib/workspace-helper';
import { redirect } from 'next/navigation';

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
  const { data, count } = await getData(wsId, searchParams);

  const secrets = await getSecrets({
    wsId,
    requiredSecrets: ['ENABLE_FINANCE', 'ENABLE_INVOICE'],
    forceAdmin: true,
  });

  const verifySecret = (secret: string, value: string) =>
    secrets.find((s) => s.name === secret)?.value === value;

  const enableFinance = verifySecret('ENABLE_FINANCE', 'true');
  const enableInvoice = verifySecret('ENABLE_INVOICE', 'true');

  if (!enableFinance) redirect(`/${wsId}`);
  if (!enableInvoice) redirect(`/${wsId}/finance`);

  return (
    <DataTable
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
        created_at: false,
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
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('finance_invoices')
    .select('*, customer:workspace_users!customer_id(full_name)', {
      count: 'exact',
    })
    .eq('ws_id', wsId);

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
