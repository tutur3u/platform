'use client';

import { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
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
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: TaskBoard;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
});

export function TaskBoardForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations();
  const router = useRouter();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/task-boards/${data.id}`
          : `/api/v1/workspaces/${wsId}/task-boards`,
        {
          method: data.id ? 'PUT' : 'POST',
          body: JSON.stringify(data),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        router.refresh();
      } else {
        const data = await res.json();
        toast({
          title: `Failed to ${data.id ? 'edit' : 'create'} task board`,
          description: data.message,
        });
      }
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} task board`,
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('ws-task-boards.name')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('ws-task-boards.name')}
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {!!data?.id ? t('common.edit') : t('common.create')}
        </Button>
      </form>
    </Form>
  );
}
