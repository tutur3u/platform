import { UserDatabaseFilter } from '../filters';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ColorPicker } from '@/components/ui/color-picker';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { UserGroup } from '@/types/primitives/UserGroup';
import { UserGroupTag } from '@/types/primitives/user-group-tag';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  wsId: string;
  data: UserGroupTag;
  submitLabel?: string;
  onSubmit: (values: z.infer<typeof FormSchema>) => void;
}

const FormSchema = z.object({
  name: z.string().min(1),
  color: z.string().min(1).optional(),
  group_ids: z.array(z.string()).optional(),
});

export const GroupTagFormSchema = FormSchema;

export default function GroupTagForm({
  wsId,
  data,
  submitLabel,
  onSubmit,
}: Props) {
  const { t } = useTranslation('ws-user-group-tags');

  const { data: queryData, isPending } = useQuery({
    queryKey: ['workspaces', wsId, 'user-groups'],
    queryFn: () => getUserGroups(wsId),
  });

  const userGroups = queryData?.data;

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    values: {
      name: data.name || '',
      color: data.color || undefined,
      group_ids: data.group_ids,
    },
  });

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('tag_name')}</FormLabel>
              <FormControl>
                <Input
                  placeholder={t('tag_name')}
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-center space-x-2">
          <Checkbox
            id="enable-custom-color"
            checked={!!form.watch('color')}
            onCheckedChange={(checked) => {
              if (checked) {
                form.setValue('color', '#000000');
              } else {
                form.setValue('color', undefined);
              }
            }}
          />
          <label
            htmlFor="enable-custom-color"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {t('enable_custom_color')}
          </label>
        </div>

        {!!form.watch('color') && (
          <FormField
            control={form.control}
            name="color"
            render={({ field }) => (
              <FormItem className="overflow-hidden">
                <FormLabel>{t('tag_color')}</FormLabel>
                <FormControl>
                  <ColorPicker
                    {...field}
                    text={form.watch('name')}
                    value={field.value!}
                    onChange={field.onChange}
                    className="w-full flex-grow-0 break-all line-clamp-1 whitespace-nowrap overflow-ellipsis"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <Separator />

        <UserDatabaseFilter
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
          disabled={isPending || !!data.id}
          align="center"
          alwaysEnableZero
          alwaysShowNumber
        />
        <Button type="submit" className="w-full" disabled={disabled}>
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}

async function getUserGroups(wsId: string) {
  const supabase = createClientComponentClient();

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
