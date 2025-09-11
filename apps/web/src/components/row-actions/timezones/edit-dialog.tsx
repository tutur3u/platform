'use client';

import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useState } from 'react';
import type * as z from 'zod';
import TimezoneForm, { type ApiConfigFormSchema } from './form';

interface Props {
  data: Timezone;
  trigger?: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  submitLabel?: string;
}

export default function TimezoneEditDialog({
  data,
  trigger,
  open: externalOpen,
  setOpen: setExternalOpen,
  submitLabel,
}: Props) {
  const router = useRouter();
  const t = useTranslations('ws-secrets');

  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const handleSubmit = async (values: z.infer<typeof ApiConfigFormSchema>) => {
    const res = await fetch('/api/v1/infrastructure/timezones', {
      method: data.value ? 'PUT' : 'POST',
      body: JSON.stringify(values),
    });

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
        onOpenAutoFocus={(e) => (data.value ? e.preventDefault() : null)}
      >
        <DialogHeader>
          <DialogTitle>{t('workspace_secret')}</DialogTitle>
          <DialogDescription>
            {data.value
              ? t('edit_existing_workspace_secret')
              : t('add_new_workspace_secret')}
          </DialogDescription>
        </DialogHeader>

        <TimezoneForm
          data={data}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
