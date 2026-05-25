'use client';

import { createWorkspaceTaskList } from '@tuturuuu/internal-api/tasks';
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
import { useTranslations } from 'next-intl';
import * as z from 'zod';

interface TaskListFormProps {
  wsId: string;
  boardId: string;
  onSuccess?: () => void;
}

const FormSchema = z.object({
  name: z.string().min(1, 'List name is required'),
});

function isTaskListNameExistsError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'TASK_LIST_NAME_EXISTS'
  );
}

export function TaskListForm({ wsId, boardId, onSuccess }: TaskListFormProps) {
  const router = useRouter();
  const t = useTranslations();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
    },
  });

  const onSubmit = async (values: z.infer<typeof FormSchema>) => {
    try {
      await createWorkspaceTaskList(wsId, boardId, {
        name: values.name,
      });

      toast({
        title: 'Task list created',
        description: 'The new task list has been added successfully.',
      });
      onSuccess?.();
      router.refresh();
    } catch (error: any) {
      console.error('Error creating task list:', error);
      toast({
        title: 'Failed to create task list',
        description: isTaskListNameExistsError(error)
          ? t('ws-task-boards.layout_settings.list_name_exists')
          : error.message || 'An unexpected error occurred.',
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
