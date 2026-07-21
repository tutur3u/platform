'use client';

import {
  createWorkspaceGroupTag,
  updateWorkspaceGroupTag,
} from '@tuturuuu/internal-api';
import type { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';
import { Button } from '@tuturuuu/ui/button';
import { ColorPicker } from '@tuturuuu/ui/color-picker';
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

interface Props {
  wsId: string;
  data?: UserGroupTag;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  color: z.string().min(1),
  group_ids: z.array(z.string()).optional(),
});

export default function GroupTagForm({ wsId, data, onFinish }: Props) {
  const t = useTranslations('ws-user-group-tags');
  const router = useRouter();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      color: data?.color || '#000000',
      group_ids: data?.group_ids,
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      // Forwarded-auth facades over POST/PUT /group-tags (replace the legacy raw
      // client-side fetches — disallowed in tanstack-web).
      const payload = {
        name: data.name,
        color: data.color,
        group_ids: data.group_ids,
      };
      if (data.id) {
        await updateWorkspaceGroupTag(wsId, data.id, payload);
      } else {
        await createWorkspaceGroupTag(wsId, payload);
      }

      onFinish?.(data);
      router.refresh();
    } catch (error) {
      toast({
        title: `Failed to ${data.id ? 'edit' : 'create'} group tag`,
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
              <FormLabel>{t('name')}</FormLabel>
              <FormControl>
                <Input placeholder={t('name')} autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="color"
          render={({ field }) => (
            <FormItem className="overflow-hidden">
              <FormLabel>{t('color')}</FormLabel>
              <FormControl>
                <ColorPicker
                  {...field}
                  text={form.watch('name')}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  className="line-clamp-1 w-full grow-0 text-ellipsis whitespace-nowrap break-all"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={disabled}>
          {data?.id ? t('edit') : t('create')}
        </Button>
      </form>
    </Form>
  );
}
