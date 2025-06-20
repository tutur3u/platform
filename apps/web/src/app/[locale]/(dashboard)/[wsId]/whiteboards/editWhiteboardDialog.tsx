'use client';

import { type Whiteboard } from './client';
import WhiteboardForm, { type WhiteboardFormValues } from './whiteboardForm';
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
import { useState } from 'react';

interface EditWhiteboardDialogProps {
  whiteboard: Whiteboard;
  trigger: React.ReactNode;
}

export default function EditWhiteboardDialog({
  whiteboard,
  trigger,
}: EditWhiteboardDialogProps) {
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
        toast.error('You must be logged in to edit a whiteboard');
        return;
      }

      // Update the whiteboard
      const { error } = await supabase
        .from('whiteboards')
        .update({
          title: values.title,
          description: values.description || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', whiteboard.id);

      if (error) {
        console.error('Error updating whiteboard:', error);
        toast.error('Failed to update whiteboard. Please try again.');
        return;
      }

      toast.success('Whiteboard updated successfully!');
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const defaultValues: WhiteboardFormValues = {
    title: whiteboard.title,
    description: whiteboard.description || '',
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Whiteboard</DialogTitle>
        </DialogHeader>
        <WhiteboardForm
          defaultValues={defaultValues}
          whiteboardId={whiteboard.id}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </DialogContent>
    </Dialog>
  );
}
