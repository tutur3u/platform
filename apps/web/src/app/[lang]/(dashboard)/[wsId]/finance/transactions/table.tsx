'use client';

import { transactionColumns } from './columns';
import { TransactionForm } from './form';
import { Transaction } from '@/types/primitives/Transaction';
import { DataTable } from '@repo/ui/components/ui/custom/tables/data-table';
import { Dialog } from '@repo/ui/components/ui/dialog';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';

interface Props {
  wsId: string;
  data: Transaction[];
  count: number;
}

export default function TransactionsTable({ wsId, data, count }: Props) {
  const { t } = useTranslation('common');

  const [transaction, setTransaction] = useState<Transaction>();

  const onComplete = () => {
    setTransaction(undefined);
  };

  return (
    <Dialog
      open={!!transaction}
      onOpenChange={(open) =>
        setTransaction(open ? transaction || {} : undefined)
      }
    >
      <DataTable
        data={data}
        columnGenerator={(t) => transactionColumns(t, setTransaction)}
        namespace="transaction-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          report_opt_in: false,
          created_at: false,
        }}
        editContent={
          <TransactionForm
            wsId={wsId}
            data={transaction}
            onComplete={onComplete}
            submitLabel={transaction?.id ? t('edit') : t('create')}
          />
        }
      />
    </Dialog>
  );
}
