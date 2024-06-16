'use client';

import { walletColumns } from './columns';
import { WalletForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { Wallet } from '@/types/primitives/Wallet';
import { Dialog } from '@repo/ui/components/ui/dialog';
import { Translate } from 'next-translate';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';

interface Props {
  wsId: string;
  data: Wallet[];
  count: number;
}

export default function WalletsTable({ wsId, data, count }: Props) {
  const { t } = useTranslation('common');

  const [wallet, setWallet] = useState<Wallet>();

  const onComplete = () => {
    setWallet(undefined);
  };

  return (
    <Dialog
      open={!!wallet}
      onOpenChange={(open) => setWallet(open ? wallet || {} : undefined)}
    >
      <CustomDataTable
        data={data}
        columnGenerator={(t: Translate) => walletColumns(t, setWallet)}
        namespace="wallet-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          description: false,
          type: false,
          currency: false,
          report_opt_in: false,
          created_at: false,
        }}
        editContent={
          <WalletForm
            wsId={wsId}
            data={wallet}
            onComplete={onComplete}
            submitLabel={wallet?.id ? t('edit') : t('create')}
          />
        }
      />
    </Dialog>
  );
}
