'use client';

import { transactionCategoryColumns } from './columns';
import { TransactionCategoryForm } from './form';
import { CustomDataTable } from '@/components/custom-data-table';
import { TransactionCategory } from '@/types/primitives/TransactionCategory';
import { Dialog } from '@repo/ui/components/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
  const t = useTranslations('common');

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
      <CustomDataTable
        data={data}
        columnGenerator={(t: any) =>
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
