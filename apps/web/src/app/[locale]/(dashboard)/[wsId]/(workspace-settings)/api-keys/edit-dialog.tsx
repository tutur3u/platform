'use client';

import ApiKeyForm, { ApiConfigFormSchema } from './form';
import { WorkspaceApiKey } from '@/types/primitives/WorkspaceApiKey';
import { generateRandomUUID } from '@/utils/uuid-helper';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { toast } from '@repo/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import * as z from 'zod';

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
  const t = useTranslations('ws-api-keys');

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
