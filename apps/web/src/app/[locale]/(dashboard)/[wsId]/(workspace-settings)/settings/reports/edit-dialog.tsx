'use client';

import ConfigForm, { ConfigFormSchema } from './form';
import { WorkspaceConfig } from '@repo/types/primitives/WorkspaceConfig';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import { toast } from '@repo/ui/hooks/use-toast';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import * as z from 'zod';

interface Props {
  data: WorkspaceConfig;
  trigger?: React.ReactNode;
  open?: boolean;
  resetMode?: boolean;
  setOpen?: (open: boolean) => void;
  submitLabel?: string;
}

export default function ConfigEditDialog({
  data,
  trigger,
  open: externalOpen,
  setOpen: setExternalOpen,
  resetMode,
  submitLabel,
}: Props) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const handleSubmit = async (formData: z.infer<typeof ConfigFormSchema>) => {
    const res = await fetch(
      `/api/v1/workspaces/${data.ws_id}/settings/${data.id}`,
      {
        method: 'PUT',
        body: JSON.stringify(formData),
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
          <DialogTitle>{data.name}</DialogTitle>
        </DialogHeader>

        <ConfigForm
          data={data}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
          resetMode={resetMode}
        />
      </DialogContent>
    </Dialog>
  );
}
