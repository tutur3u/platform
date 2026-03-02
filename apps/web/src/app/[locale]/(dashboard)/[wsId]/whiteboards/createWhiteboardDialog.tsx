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
      const supabase = createClient();

      // Get the current user
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast.error(t('error_must_be_logged_in'));
        return;
      }

      // Create the whiteboard
      const { error } = await supabase.from('workspace_whiteboards').insert({
        title: values.title,
        description: values.description || null,
        ws_id: wsId,
        creator_id: user.id,
      });

      if (error) {
        console.error('Error creating whiteboard:', error);
        toast.error(t('create_whiteboard_error'));
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
