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
import { WorkspaceSecret } from '@/types/primitives/WorkspaceSecret';
import SecretForm, { ApiConfigFormSchema } from './secret-form';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  data: WorkspaceSecret;
  trigger?: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  submitLabel?: string;
}

export default function SecretEditDialog({
  data,
  trigger,
  open: externalOpen,
  setOpen: setExternalOpen,
  submitLabel,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation('ws-secrets');

  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const handleSubmit = async (values: z.infer<typeof ApiConfigFormSchema>) => {
    const res = await fetch(
      data.id
        ? `/api/workspaces/${data.ws_id}/secrets/${data.id}`
        : `/api/workspaces/${data.ws_id}/secrets`,
      {
        method: data.id ? 'PUT' : 'POST',
        body: JSON.stringify(values),
      }
    );

    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} secret`,
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
          <DialogTitle>{t('workspace_secret')}</DialogTitle>
          <DialogDescription>
            {data.id
              ? t('edit_existing_workspace_secret')
              : t('add_new_workspace_secret')}
          </DialogDescription>
        </DialogHeader>

        <SecretForm
          data={data}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
