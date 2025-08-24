import { createClient } from '@tuturuuu/supabase/next/server';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Plus } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { invoiceColumns } from './columns';

interface Props {
  wsId: string;
  searchParams: {
    q: string;
    page: string;
    pageSize: string;
  };
}

export default async function InvoicesPage({ wsId: id, searchParams }: Props) {
  const t = await getTranslations();

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;

  const { data: rawData, count } = await getData(wsId, searchParams);

  const data = rawData.map((d) => ({
    ...d,
    href: `/${wsId}/finance/invoices/${d.id}`,
    ws_id: wsId,
  }));

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.plural')}
        singularTitle={t('ws-invoices.singular')}
        description={t('ws-invoices.description')}
        createTitle={t('ws-invoices.create')}
        createDescription={t('ws-invoices.create_description')}
        action={
          <Link href={`/${wsId}/finance/invoices/new`}>
            <Button>
              <Plus />
              {t('ws-invoices.create')}
            </Button>
          </Link>
        }
      />
      <Separator className="my-4" />
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
    </>
  );
}

async function getData(
  wsId: string,
  {
    // q,
    page = '1',
    pageSize = '10',
  }: { q?: string; page?: string; pageSize?: string }
) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('finance_invoices')
    .select('*, customer:workspace_users!customer_id(full_name)', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

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
    customer: customer?.full_name || '-',
  }));

  return { data, count } as { data: Invoice[]; count: number };
}
