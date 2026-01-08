import { Plus } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { Invoice } from '@tuturuuu/types/primitives/Invoice';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { getWorkspace } from '@tuturuuu/utils/workspace-helper';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { invoiceColumns } from './columns';
import { PendingInvoicesTable } from './pending-invoices-table';

type DeleteInvoiceAction = (
  wsId: string,
  invoiceId: string
) => Promise<{ success: boolean; message?: string }>;

interface Props {
  params: Promise<{
    wsId: string;
  }>;
  searchParams: Promise<{
    q: string;
    page: string;
    pageSize: string;
  }>;
  canCreateInvoices?: boolean;
  canDeleteInvoices?: boolean;
  deleteInvoiceAction?: DeleteInvoiceAction;
}

export default async function InvoicesPage({
  params,
  searchParams,
  canCreateInvoices = false,
  canDeleteInvoices = false,
  deleteInvoiceAction,
}: Props) {
  const t = await getTranslations();
  const { wsId: id } = await params;

  const workspace = await getWorkspace(id);
  const wsId = workspace.id;
  const { data: rawData, count } = await getData(wsId, await searchParams);

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
          canCreateInvoices ? (
            <Link href={`/${wsId}/finance/invoices/new`}>
              <Button>
                <Plus />
                {t('ws-invoices.create')}
              </Button>
            </Link>
          ) : null
        }
      />
      <Separator className="my-4" />
      <Tabs defaultValue="created" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="created">
            {t('ws-invoices.created_invoices')}
          </TabsTrigger>
          <TabsTrigger value="pending">
            {t('ws-invoices.pending_invoices')}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="created">
          <CustomDataTable
            data={data}
            columnGenerator={invoiceColumns}
            namespace="invoice-data-table"
            count={count}
            extraData={{
              canDeleteInvoices,
              deleteInvoiceAction,
            }}
            defaultVisibility={{
              id: false,
              customer_id: false,
              price: false,
              total_diff: false,
              note: false,
            }}
          />
        </TabsContent>
        <TabsContent value="pending">
          <PendingInvoicesTable wsId={wsId} />
        </TabsContent>
      </Tabs>
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
    const parsedPage = parseInt(page, 10);
    const parsedSize = parseInt(pageSize, 10);
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
