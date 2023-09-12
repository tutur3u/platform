import PlusCardButton from '../../../../../components/common/PlusCardButton';
import { Wallet } from '../../../../../types/primitives/Wallet';
import WalletCard from '../../../../../components/cards/WalletCard';
import PaginationIndicator from '../../../../../components/pagination/PaginationIndicator';
import GeneralSearchBar from '../../../../../components/inputs/GeneralSearchBar';
import { Separator } from '@/components/ui/separator';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { Database } from '@/types/supabase';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CreateWalletForm } from './CreateWalletForm';

interface Props {
  params: {
    wsId: string;
  };
  searchParams: {
    q: string;
  };
}

export const dynamic = 'force-dynamic';

export default async function FinanceWalletsPage({
  params: { wsId },
  searchParams,
}: Props) {
  const wallets = await getWallets(wsId, searchParams);
  const count = await getCount(wsId, searchParams);

  return (
    <div className="flex min-h-full w-full flex-col ">
      <div className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GeneralSearchBar />
      </div>

      <Separator className="mt-4" />
      <PaginationIndicator totalItems={count} />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Dialog>
          <DialogTrigger>
            <PlusCardButton href={`/${wsId}/finance/wallets/new`} />
            <PlusCardButton />
          </DialogTrigger>

          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create wallet</DialogTitle>
              <DialogDescription>
                You can create a wallet to track your cash, bank accounts, and
                credit cards.
              </DialogDescription>
            </DialogHeader>
            <CreateWalletForm />
          </DialogContent>
        </Dialog>

        {wallets.map((w) => (
          <WalletCard
            key={w.id}
            wallet={w}
            showBalance={true}
            showAmount={true}
          />
        ))}
      </div>
    </div>
  );
}

async function getWallets(wsId: string, { q }: { q: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_wallets')
    .select('*')
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { data } = await queryBuilder;
  return data as Wallet[];
}

async function getCount(wsId: string, { q }: { q: string }) {
  const supabase = createServerComponentClient<Database>({ cookies });

  const queryBuilder = supabase
    .from('workspace_wallets')
    .select('*', {
      count: 'exact',
      head: true,
    })
    .eq('ws_id', wsId);

  if (q) queryBuilder.ilike('name', `%${q}%`);

  const { count } = await queryBuilder;
  return count;
}
