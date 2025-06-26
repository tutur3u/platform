'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { useRouter } from 'next/navigation';
import * as z from 'zod';

interface TaskListFormProps {
  wsId: string;
  boardId: string;
  onSuccess?: () => void;
}

const FormSchema = z.object({
  name: z.string().min(1, 'List name is required'),
});

export function TaskListForm({ boardId, onSuccess }: TaskListFormProps) {
  const router = useRouter();
  const supabase = createClient(); // Initialize Supabase client

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    try {
      const { error } = await supabase
        .from('task_lists') // Use Supabase client to insert
        .insert({
          name: values.name,
          board_id: boardId,
          // ws_id might be needed if your task_lists table has a direct ws_id column
          // and RLS requires it, or if it's not automatically inferred via board_id
        })
        .select();

      if (error) throw error;

      toast({
        title: 'Task list created',
        description: 'The new task list has been added successfully.',
      });
      onSuccess?.();
      router.refresh();
    } catch (error: unknown) {
      console.error('Error creating task list:', error);
      toast({
        title: 'Failed to create task list',
        description:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4 py-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>List Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter list name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating...' : 'Create List'}
        </Button>
      </form>
    </Form>
  );
}
