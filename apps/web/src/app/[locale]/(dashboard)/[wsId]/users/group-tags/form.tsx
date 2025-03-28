'use client';

import { Filter } from '../filters';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';
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
import { Users } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
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

  const { data: queryData, isPending } = useQuery({
    queryKey: ['workspaces', wsId, 'user-groups'],
    queryFn: () => getUserGroups(wsId),
  });

  const userGroups = queryData?.data;

  const form = useForm<z.infer<typeof FormSchema>>({
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
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/group-tags/${data.id}`
          : `/api/v1/workspaces/${wsId}/group-tags`,
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
          title: `Failed to ${data.id ? 'edit' : 'create'} group tag`,
          description: data.message,
        });
      }
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
                  value={field.value}
                  onChange={field.onChange}
                  className="line-clamp-1 w-full grow-0 text-ellipsis whitespace-nowrap break-all"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {true || !!data?.id || (
          <>
            <Separator />

            <Filter
              title={t('linked_user_groups')}
              icon={<Users className="mr-2 h-4 w-4" />}
              defaultValues={form.watch('group_ids')}
              options={
                userGroups?.map((group) => ({
                  label: group.name || 'No name',
                  value: group.id,
                  count: group.amount,
                })) || []
              }
              onSet={(value) => form.setValue('group_ids', value)}
              disabled={isPending || !!data?.id}
              align="center"
              alwaysEnableZero
              alwaysShowNumber
            />
          </>
        )}

        <Button type="submit" className="w-full" disabled={disabled}>
          {!!data?.id ? t('edit') : t('create')}
        </Button>
      </form>
    </Form>
  );
}

async function getUserGroups(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_user_groups_with_amount')
    .select('id, name, amount', {
      count: 'exact',
    })
    .eq('ws_id', wsId)
    .order('name');

  const { data, error, count } = await queryBuilder;
  if (error) throw error;

  return { data, count } as { data: UserGroup[]; count: number };
}
