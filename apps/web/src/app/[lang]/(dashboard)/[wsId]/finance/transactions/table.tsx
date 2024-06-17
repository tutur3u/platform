'use client';

import { transactionColumns } from './columns';
import { TransactionForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { Transaction } from '@/types/primitives/Transaction';
import { Dialog } from '@repo/ui/components/ui/dialog';
import { Translate } from 'next-translate';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';

interface Props {
  wsId: string;
  data: Transaction[];
  count: number;
}

export default function TransactionsTable({ wsId, data, count }: Props) {
  const { t, lang } = useTranslation('common');

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
      <CustomDataTable
        data={data}
        columnGenerator={(t: Translate) =>
          transactionColumns(t, setTransaction, lang)
        }
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
