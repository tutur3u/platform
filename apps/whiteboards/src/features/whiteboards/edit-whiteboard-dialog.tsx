'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceWhiteboard } from '@tuturuuu/internal-api/whiteboards';
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
import { type Whiteboard, whiteboardKeys } from './whiteboard-types';

interface EditWhiteboardDialogProps {
  whiteboard: Whiteboard;
  trigger?: React.ReactNode;
}

export default function EditWhiteboardDialog({
  whiteboard,
  trigger,
}: EditWhiteboardDialogProps) {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (values: WhiteboardFormValues) =>
      updateWorkspaceWhiteboard(whiteboard.wsId, whiteboard.id, {
        title: normalizeWhiteboardTitle(values.title),
        description: normalizeWhiteboardDescription(values.description),
      }),
    onSuccess: async () => {
      toast.success(t('update_whiteboard_success'));
      setOpen(false);
      await queryClient.invalidateQueries({
        queryKey: whiteboardKeys.all(whiteboard.wsId),
      });
    },
    onError: (error) => {
      console.error('Error updating whiteboard:', error);
      const errorKey = getWhiteboardMutationErrorKey(error);
      toast.error(errorKey ? t(errorKey) : t('update_whiteboard_error'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('edit_whiteboard')}</DialogTitle>
        </DialogHeader>
        <WhiteboardForm
          whiteboardId={whiteboard.id}
          defaultValues={{
            title: whiteboard.title,
            description: whiteboard.description || '',
          }}
          onSubmit={(values) => updateMutation.mutate(values)}
          isSubmitting={updateMutation.isPending}
        />
      </DialogContent>
    </Dialog>
  );
}
