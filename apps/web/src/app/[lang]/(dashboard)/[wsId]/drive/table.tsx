'use client';

import { storageObjectsColumns } from './columns';
import { StorageObjectForm } from './form';
import { DataTable } from '@/components/ui/custom/tables/data-table';
import { Dialog } from '@/components/ui/dialog';
import { StorageObject } from '@/types/primitives/StorageObject';
import useTranslation from 'next-translate/useTranslation';
import { useState } from 'react';

interface Props {
  wsId: string;
  data: StorageObject[];
  count: number;
}

export default function StorageObjectsTable({ wsId, data, count }: Props) {
  const { t } = useTranslation('common');

  const [storageObj, setStorageObject] = useState<StorageObject>();

  const onComplete = () => {
    setStorageObject(undefined);
  };

  return (
    <Dialog
      open={!!storageObj}
      onOpenChange={(open) =>
        setStorageObject(open ? storageObj || {} : undefined)
      }
    >
      <DataTable
        data={data}
        columnGenerator={(t) =>
          storageObjectsColumns(t, setStorageObject, wsId)
        }
        namespace="storage-object-data-table"
        count={count}
        defaultVisibility={{
          id: false,
        }}
        newObjectTitle={t('upload')}
        editContent={
          <StorageObjectForm
            wsId={wsId}
            onComplete={onComplete}
            submitLabel={storageObj?.id ? t('edit') : t('upload')}
          />
        }
      />
    </Dialog>
  );
}
