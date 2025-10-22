'use client';

import type { WorkspaceApiKey } from '@tuturuuu/types/primitives/WorkspaceApiKey';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type React from 'react';
import { useState } from 'react';
import type * as z from 'zod';
import ApiKeyForm, { type ApiConfigFormSchema } from './form';

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
        body: JSON.stringify(values),
      }
    );

    if (res.ok) {
      const responseData = await res.json();

      // For new keys, the server returns the generated key and prefix
      // Show it to the user (they won't be able to see it again)
      if (!data.id && responseData.key) {
        toast.success('API key created successfully', {
          description: `Key: ${responseData.key}`,
          duration: 10000,
        });
      }

      setOpen(false);
      router.refresh();
    } else {
      const errorData = await res.json();
      toast.error(`Failed to ${data.id ? 'edit' : 'create'} api key`, {
        description: errorData.message,
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
