import PlusCardButton from '../../../../../components/common/PlusCardButton';
import InvoiceCard from '../../../../../components/cards/InvoiceCard';
import { Invoice } from '../../../../../types/primitives/Invoice';
import StatusSelector from '../../../../../components/selectors/StatusSelector';
import PaginationIndicator from '../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';
import { Separator } from '@/components/ui/separator';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/types/supabase';
import { cookies } from 'next/headers';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
    status: string;
  };
}

export default async function WorkspaceInvoicesPage({
  params: { wsId },
  searchParams,
}: Props) {
  const invoices = await getInvoices(wsId, searchParams);
  const count = await getCount(wsId, searchParams);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
        <StatusSelector preset="completion" />
      </div>

      <Separator className="mt-4" />
      <PaginationIndicator totalItems={count} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlusCardButton href={`/${wsId}/finance/invoices/new`} />

        {invoices.map((p) => (
          <InvoiceCard
            key={p.id}
            invoice={p}
            showAddress={true}
            showGender={true}
            showPhone={true}
            showTime={true}
            showStatus={true}
            showAmount={true}
            showPrice={true}
            showCreator={true}
          />
        ))}
      </div>
    </div>
  );
}

async function getInvoices(
  wsId: string,
  { q, status }: { q: string; status: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('finance_invoices')
    .select('*')
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);
  if (status) queryBuilder.eq('status', status);

  const { data } = await queryBuilder;
  return data as Invoice[];
}

async function getCount(
  wsId: string,
  { q, status }: { q: string; status: string }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('finance_invoices')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);
  if (status) queryBuilder.eq('status', status);

  const { count } = await queryBuilder;
  return count;
}
