'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useRouter } from 'next/navigation';
import * as z from 'zod';

interface TaskFormProps {
  wsId: string;
  boardId: string;
  listId: string;
  onSuccess?: () => void;
}

const FormSchema = z.object({
  name: z.string().min(1, 'Task name is required'),
  description: z.string().optional(),
  // status: z.enum(taskStatuses).optional().default('Todo'),
  // priority: z.enum(taskPriorities).optional().default('Medium'),
  end_date: z.string().optional(), // Changed from due_date
});

export function TaskForm({ listId, onSuccess }: TaskFormProps) {
  const router = useRouter();
  const supabase = createClient(); // Initialize Supabase client

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      description: '',
      // status: 'Todo',
      // priority: 'Medium',
      end_date: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    try {
      const { error } = await supabase
        .from('tasks') // Use Supabase client to insert
        .insert({
          name: values.name,
          description: values.description,
          // priority: values.priority,
          end_date: values.end_date || null, // Handle optional date
          list_id: listId,
          // ws_id and board_id might be needed depending on your RLS and table structure
          // If tasks table doesn't directly link to ws_id, it might be inferred via list_id -> board_id -> ws_id
        });

      if (error) throw error;

      toast({
        title: 'Task created',
        description: 'The new task has been added successfully.',
      });
      onSuccess?.();
      router.refresh();
    } catch (error: unknown) {
      console.error('Error creating task:', error);
      toast({
        title: 'Failed to create task',
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
              <FormLabel>Task Name</FormLabel>
              <FormControl>
                <Input placeholder="Enter task name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="(Optional) Enter task description"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="end_date" // Changed from due_date
          render={({ field }) => (
            <FormItem>
              <FormLabel>End Date</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value || ''} />
              </FormControl>
              <FormDescription>(Optional) Select an end date.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          {form.formState.isSubmitting ? 'Creating...' : 'Create Task'}
        </Button>
      </form>
    </Form>
  );
}
