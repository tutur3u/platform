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
        toast.error('You must be logged in to create a whiteboard');
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
        toast.error('Failed to create whiteboard. Please try again.');
        return;
      }

      toast.success('Whiteboard created successfully!');
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Unexpected error:', error);
      toast.error('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create New Whiteboard</DialogTitle>
        </DialogHeader>
        <WhiteboardForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </DialogContent>
    </Dialog>
  );
}
