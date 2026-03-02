'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
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
import type { Whiteboard } from './client';
import WhiteboardForm, { type WhiteboardFormValues } from './whiteboardForm';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const handleSubmit = async (values: WhiteboardFormValues) => {
    setIsSubmitting(true);

    try {
      const supabase = createClient();

      // Update the whiteboard
      const { error } = await supabase
        .from('workspace_whiteboards')
        .update({
          title: values.title,
          description: values.description || null,
        })
        .eq('id', whiteboard.id);

      if (error) {
        console.error('Error updating whiteboard:', error);
        toast.error(t('update_whiteboard_error'));
        return;
      }

      toast.success(t('update_whiteboard_success'));
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
          <DialogTitle>{t('edit_whiteboard')}</DialogTitle>
        </DialogHeader>
        <WhiteboardForm
          whiteboardId={whiteboard.id}
          defaultValues={{
            title: whiteboard.title,
            description: whiteboard.description || '',
          }}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
