'use client';

import { DataTable } from '@/components/ui/custom/tables/data-table';
import { TransactionCategory } from '@/types/primitives/TransactionCategory';
import { useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { transactionCategoryColumns } from './columns';
import useTranslation from 'next-translate/useTranslation';
import { TransactionCategoryForm } from './form';

interface Props {
  wsId: string;
  data: TransactionCategory[];
  count: number;
}

export default function TransactionCategoriesTable({
  wsId,
  data,
  count,
}: Props) {
  const { t } = useTranslation('common');

  const [category, setTransactionCategory] = useState<TransactionCategory>();

  const onComplete = () => {
    setTransactionCategory(undefined);
  };

  return (
    <Dialog
      open={!!category}
      onOpenChange={(open) =>
        setTransactionCategory(open ? category || {} : undefined)
      }
    >
      <DataTable
        data={data}
        columnGenerator={(t) =>
          transactionCategoryColumns(t, setTransactionCategory)
        }
        namespace="transaction-category-data-table"
        count={count}
        defaultVisibility={{
          id: false,
          created_at: false,
        }}
        editContent={
          <TransactionCategoryForm
            wsId={wsId}
            data={category}
            onComplete={onComplete}
            submitLabel={category?.id ? t('edit') : t('create')}
          />
        }
      />
    </Dialog>
  );
}
