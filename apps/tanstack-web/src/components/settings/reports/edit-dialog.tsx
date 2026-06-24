'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import type React from 'react';
import { useState } from 'react';
import ConfigForm, { type ConfigFormValues } from './form';
import type { UpdateWorkspaceReportConfig } from './types';

interface Props {
  data: WorkspaceConfig;
  open?: boolean;
  resetMode?: boolean;
  setOpen?: (open: boolean) => void;
  submitLabel?: string;
  trigger?: React.ReactNode;
  updateConfig: UpdateWorkspaceReportConfig;
}

export default function ConfigEditDialog({
  data,
  open: externalOpen,
  resetMode,
  setOpen: setExternalOpen,
  submitLabel,
  trigger,
  updateConfig,
}: Props) {
  const queryClient = useQueryClient();
  const [internalOpen, setInternalOpen] = useState(false);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const handleSubmit = async (formData: ConfigFormValues) => {
    if (!data.ws_id || !data.id) {
      toast({
        description: 'Missing workspace config identifier.',
        title: 'Failed to update report setting',
      });
      return;
    }

    const result = await updateConfig({
      configId: data.id,
      value: formData.value ?? '',
      workspaceId: data.ws_id,
    });

    if (result.ok) {
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: ['workspace-settings', 'reports', data.ws_id],
      });
      return;
    }

    toast({
      description: result.message,
      title: 'Failed to update report setting',
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        onOpenAutoFocus={(event) => (data.name ? event.preventDefault() : null)}
      >
        <DialogHeader>
          <DialogTitle>{data.name}</DialogTitle>
        </DialogHeader>

        <ConfigForm
          data={data}
          onSubmit={handleSubmit}
          resetMode={resetMode}
          submitLabel={submitLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
