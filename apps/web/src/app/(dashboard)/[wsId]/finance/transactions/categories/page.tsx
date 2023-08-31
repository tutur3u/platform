import PlusCardButton from '../../../../../../components/common/PlusCardButton';
import { TransactionCategory } from '../../../../../../types/primitives/TransactionCategory';
import GeneralItemCard from '../../../../../../components/cards/GeneralItemCard';
import PaginationIndicator from '../../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../../components/inputs/GeneralSearchBar';
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
  };
}

export default async function FinanceCategoriesPage({
  params: { wsId },
  searchParams,
}: Props) {
  const categories = await getCategories(wsId, searchParams);
  const count = await getCount(wsId, searchParams);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
      </div>

      <Separator className="mt-4" />
      <PaginationIndicator totalItems={count} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <PlusCardButton href={`/${wsId}/finance/transactions/categories/new`} />
        {categories.map((c) => (
          <GeneralItemCard
            key={c.id}
            href={`/${wsId}/finance/transactions/categories/${c.id}`}
            name={c.name}
            amountFetchPath={`/api/workspaces/${wsId}/finance/transactions/categories/${c.id}/amount`}
            amountTrailing="giao dịch"
            showAmount={true}
          />
        ))}
      </div>
    </div>
  );
}

async function getCategories(wsId: string, { q }: { q: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('transaction_categories')
    .select('*')
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { data } = await queryBuilder;
  return data as TransactionCategory[];
}

async function getCount(wsId: string, { q }: { q: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('transaction_categories')
    .select('*', { count: 'exact', head: true })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { count } = await queryBuilder;
  return count;
}
