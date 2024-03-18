'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import * as z from 'zod';
import { toast } from '@/components/ui/use-toast';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import { WorkspaceApiKey } from '@/types/primitives/WorkspaceApiKey';
import ApiKeyForm, { ApiConfigFormSchema } from './form';
import useTranslation from 'next-translate/useTranslation';
import { generateRandomUUID } from '@/utils/uuid-helper';

interface Props {
  data: WorkspaceApiKey;
  trigger?: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  submitLabel?: string;
}

export default function ApiKeyEditDialog({
  data,
  trigger,
  open: externalOpen,
  setOpen: setExternalOpen,
  submitLabel,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation('ws-api-keys');

  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const handleSubmit = async (values: z.infer<typeof ApiConfigFormSchema>) => {
    const res = await fetch(
      data.id
        ? `/api/v1/workspaces/${data.ws_id}/api-keys/${data.id}`
        : `/api/v1/workspaces/${data.ws_id}/api-keys`,
      {
        method: data.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...values,
          value: data.id
            ? values.value
            : `${generateRandomUUID() + generateRandomUUID()}`.replace(
                /-/g,
                ''
              ),
        }),
      }
    );

    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} api key`,
        description: data.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        onOpenAutoFocus={(e) => (data.name ? e.preventDefault() : null)}
      >
        <DialogHeader>
          <DialogTitle>{t('api_key')}</DialogTitle>
          <DialogDescription>
            {data.id
              ? t('edit_existing_workspace_key')
              : t('add_new_workspace_key')}
          </DialogDescription>
        </DialogHeader>

        <ApiKeyForm
          data={data}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
