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
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import UserFieldForm, { ApiConfigFormSchema } from './form';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  data: WorkspaceUserField;
  trigger?: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  submitLabel?: string;
}

export default function UserFieldEditDialog({
  data,
  trigger,
  open: externalOpen,
  setOpen: setExternalOpen,
  submitLabel,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation('ws-user-fields');

  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const handleSubmit = async (values: z.infer<typeof ApiConfigFormSchema>) => {
    const res = await fetch(
      data.id
        ? `/api/v1/workspaces/${data.ws_id}/users/fields/${data.id}`
        : `/api/v1/workspaces/${data.ws_id}/users/fields`,
      {
        method: data.id ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...values,
          ws_id: data.ws_id,
        }),
      }
    );

    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} user field`,
        description: data.message,
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        onOpenAutoFocus={(e) => (data.name ? e.preventDefault() : null)}
        className="gap-0 p-0"
      >
        <DialogHeader className="p-4">
          <DialogTitle>{t('module')}</DialogTitle>
          <DialogDescription>
            {data.id ? t('edit_existing_user_field') : t('add_new_user_field')}
          </DialogDescription>
        </DialogHeader>

        <UserFieldForm
          data={data}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
