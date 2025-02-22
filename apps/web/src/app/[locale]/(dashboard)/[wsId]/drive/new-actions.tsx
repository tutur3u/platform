'use client';

import { StorageFolderForm, StorageObjectForm } from './form';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { FileText, Folder, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  wsId: string;
  path?: string;
}

export default function NewActions({ wsId, path }: Props) {
  const t = useTranslations();

  const [showFileUploadDialog, setFileUploadDialog] = useState(false);
  const [showFolderCreateDialog, setFolderCreateDialog] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="xs" className="cursor-pointer">
            <Plus className="h-4 w-4" />
            <span>{t('common.create_new')}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={() => setFolderCreateDialog(true)}>
            <Folder className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.folder')}
          </DropdownMenuItem>{' '}
          <DropdownMenuItem onSelect={() => setFileUploadDialog(true)}>
            <FileText className="mr-2 h-4 w-4" />
            {t('ws-storage-objects.files')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        open={showFileUploadDialog}
        setOpen={setFileUploadDialog}
        title={t('ws-storage-objects.upload')}
        form={
          <StorageObjectForm
            wsId={wsId}
            uploadPath={path}
            submitLabel={t('common.upload')}
          />
        }
      />

      <ModifiableDialogTrigger
        open={showFolderCreateDialog}
        title={t('ws-storage-objects.folder_create')}
        setOpen={setFolderCreateDialog}
        form={<StorageFolderForm wsId={wsId} uploadPath={path} />}
      />
    </>
  );
}
