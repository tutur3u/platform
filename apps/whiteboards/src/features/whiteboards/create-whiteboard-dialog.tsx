'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createWorkspaceWhiteboard } from '@tuturuuu/internal-api/whiteboards';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  getWhiteboardMutationErrorKey,
  normalizeWhiteboardDescription,
  normalizeWhiteboardTitle,
} from './validation';
import WhiteboardForm, { type WhiteboardFormValues } from './whiteboard-form';
import { whiteboardKeys } from './whiteboard-types';

interface CreateWhiteboardDialogProps {
  wsId: string;
  trigger?: React.ReactNode;
}

export default function CreateWhiteboardDialog({
  wsId,
  trigger,
}: CreateWhiteboardDialogProps) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (values: WhiteboardFormValues) =>
      createWorkspaceWhiteboard(wsId, {
        title: normalizeWhiteboardTitle(values.title),
        description: normalizeWhiteboardDescription(values.description),
      }),
    onSuccess: async () => {
      toast.success(t('create_whiteboard_success'));
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: whiteboardKeys.list(wsId),
      });
    },
    onError: (error) => {
      console.error('Error creating whiteboard:', error);
      const errorKey = getWhiteboardMutationErrorKey(error);
      toast.error(errorKey ? t(errorKey) : t('create_whiteboard_error'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('create_whiteboard')}</DialogTitle>
        </DialogHeader>
        <WhiteboardForm
          onSubmit={(values) => createMutation.mutate(values)}
          isSubmitting={createMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
