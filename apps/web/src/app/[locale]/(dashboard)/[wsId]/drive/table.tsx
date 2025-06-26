'use client';

import type { StorageObject } from '@tuturuuu/types/primitives/StorageObject';
import { Dialog } from '@tuturuuu/ui/dialog';
import { useState } from 'react';
import { CustomDataTable } from '@/components/custom-data-table';
import { storageObjectsColumns } from './columns';

interface Props {
  wsId: string;
  data: StorageObject[];
  path?: string;
  count: number;
}

export default function StorageObjectsTable({
  wsId,
  data,
  path,
  count,
}: Props) {
  // const t = useTranslations('common');

  const [storageObj, setStorageObject] = useState<StorageObject>();

  // const onComplete = () => {
  //   setStorageObject(undefined);
  // };

  return (
    <Dialog
      open={!!storageObj}
      onOpenChange={(open) =>
        setStorageObject(open ? storageObj || {} : undefined)
      }
    >
      <CustomDataTable
        data={!path || path === '/' ? data : [{ name: '...' }, ...data]}
        columnGenerator={(
          t: (key: string) => string,
          namespace: string | undefined
        ) => storageObjectsColumns(t, namespace, setStorageObject, wsId, path)}
        namespace="storage-object-data-table"
        count={count}
        defaultVisibility={{
          id: false,
        }}
        // newObjectTitle={t('upload')}
        // editContent={
        //   <>
        //     <DialogTitle hidden />
        //     <StorageObjectForm
        //       wsId={wsId}
        //       onComplete={onComplete}
        //       uploadPath={path}
        //       submitLabel={storageObj?.id ? t('edit') : t('upload')}
        //     />
        //   </>
        // }
      />
    </Dialog>
  );
}
