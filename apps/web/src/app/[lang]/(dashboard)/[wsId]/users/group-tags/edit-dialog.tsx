'use client';

import GroupTagForm, { GroupTagFormSchema } from './form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { UserGroupTag } from '@/types/primitives/user-group-tag';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';
import React, { useState } from 'react';
import * as z from 'zod';

interface Props {
  wsId: string;
  data: UserGroupTag;
  trigger?: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  submitLabel?: string;
}

export default function GroupTagEditDialog({
  wsId,
  data,
  trigger,
  open: externalOpen,
  setOpen: setExternalOpen,
  submitLabel,
}: Props) {
  const router = useRouter();
  const { t } = useTranslation('ws-user-group-tags');

  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const handleSubmit = async (values: z.infer<typeof GroupTagFormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${data.ws_id}/group-tags/${data.id}`
          : `/api/v1/workspaces/${data.ws_id}/group-tags`,
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
          title: `Failed to ${data.id ? 'edit' : 'create'} group tag`,
          description: data.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} group tag`,
        description: error instanceof Error ? error.message : String(error),
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
          <DialogTitle>{t('group_tag')}</DialogTitle>
          <DialogDescription>
            {data.id ? t('edit_existing_group_tag') : t('add_new_group_tag')}
          </DialogDescription>
        </DialogHeader>

        <GroupTagForm
          wsId={wsId}
          data={data}
          onSubmit={handleSubmit}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
