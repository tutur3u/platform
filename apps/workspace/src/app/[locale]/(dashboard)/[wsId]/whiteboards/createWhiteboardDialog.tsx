'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  getWhiteboardMutationErrorKey,
  normalizeWhiteboardDescription,
  normalizeWhiteboardTitle,
} from './validation';
import WhiteboardForm, { type WhiteboardFormValues } from './whiteboardForm';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (values: WhiteboardFormValues) => {
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/v1/workspaces/${wsId}/whiteboards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          title: normalizeWhiteboardTitle(values.title),
          description: normalizeWhiteboardDescription(values.description),
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => null);
        console.error('Error creating whiteboard:', error);
        const errorKey = getWhiteboardMutationErrorKey(error);
        toast.error(errorKey ? t(errorKey) : t('create_whiteboard_error'));
        return;
      }

      toast.success(t('create_whiteboard_success'));
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast.error(t('error_occurred'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('create_whiteboard')}</DialogTitle>
        </DialogHeader>
        <WhiteboardForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </DialogContent>
    </Dialog>
  );
}
