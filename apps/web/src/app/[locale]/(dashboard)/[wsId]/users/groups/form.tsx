'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CalendarIcon } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as z from 'zod';

interface Props {
  wsId: string;
  data?: UserGroup;
  onFinish?: (data: z.infer<typeof FormSchema>) => void;
  canCreate?: boolean;
  canUpdate?: boolean;
}

const FormSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1),
    is_guest: z.boolean().default(false),
    starting_date: z.date().optional().nullable(),
    ending_date: z.date().optional().nullable(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.starting_date && data.ending_date) {
        return data.ending_date >= data.starting_date;
      }
      return true;
    },
    {
      message: 'End date must be after or equal to start date',
      path: ['ending_date'],
    }
  );

export default function UserGroupForm({
  wsId,
  data,
  onFinish,
  canCreate = false,
  canUpdate = false,
}: Props) {
  const t = useTranslations('ws-user-groups');
  const tCommon = useTranslations('common');
  const tSchedule = useTranslations('ws-user-group-schedule');
  const router = useRouter();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      id: data?.id,
      name: data?.name || '',
      is_guest: data?.is_guest || false,
      starting_date: data?.starting_date
        ? new Date(data.starting_date)
        : undefined,
      ending_date: data?.ending_date ? new Date(data.ending_date) : undefined,
      notes: data?.notes || '',
    },
  });

  // If no permission to create or update, don't show the form
  if (!canCreate && !canUpdate) {
    return null;
  }

  // If editing and no update permission, don't show the form
  if (data?.id && !canUpdate) {
    return null;
  }

  // If creating and no create permission, don't show the form
  if (!data?.id && !canCreate) {
    return null;
  }

  const isDirty = form.formState.isDirty;
  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isDirty || !isValid || isSubmitting;

  const onSubmit = async (data: z.infer<typeof FormSchema>) => {
    try {
      const res = await fetch(
        data.id
          ? `/api/v1/workspaces/${wsId}/user-groups/${data.id}`
          : `/api/v1/workspaces/${wsId}/user-groups`,
        {
          method: data.id ? 'PUT' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        }
      );

      if (res.ok) {
        onFinish?.(data);
        queryClient.invalidateQueries({
          queryKey: ['workspace-user-groups', wsId],
        });
        router.refresh();
      } else {
        const errorData = await res.json();
        toast.error(errorData.message);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
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
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{tSchedule('notes')}</FormLabel>
              <FormControl>
                <Textarea
                  placeholder={tSchedule('notes')}
                  autoComplete="off"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="starting_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{tSchedule('start_date')}</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={'outline'}
                        className={cn(
                          'w-full pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? (
                          dayjs(field.value).format('DD/MM/YYYY')
                        ) : (
                          <span>{tCommon('pick_a_date')}</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value || undefined}
                      onSelect={field.onChange}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>
                  {tSchedule('start_date_help')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ending_date"
            render={({ field }) => (
              <FormItem className="flex flex-col">
                <FormLabel>{tSchedule('end_date')}</FormLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <FormControl>
                      <Button
                        variant={'outline'}
                        className={cn(
                          'w-full pl-3 text-left font-normal',
                          !field.value && 'text-muted-foreground'
                        )}
                      >
                        {field.value ? (
                          dayjs(field.value).format('DD/MM/YYYY')
                        ) : (
                          <span>{tCommon('pick_a_date')}</span>
                        )}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={field.value || undefined}
                      onSelect={field.onChange}
                      disabled={(date) => {
                        const start = form.getValues('starting_date');
                        return start ? date < start : false;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <FormDescription>{tSchedule('end_date_help')}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="is_guest"
          render={({ field }) => (
            <FormItem>
              <div className="rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50">
                <div className="flex items-start space-x-3">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      className="mt-0.5"
                      aria-describedby="guest-group-description"
                    />
                  </FormControl>
                  <div className="flex-1 space-y-2">
                    <FormLabel className="font-medium text-base leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                      Guest Group
                    </FormLabel>
                    <p
                      id="guest-group-description"
                      className="text-muted-foreground text-sm leading-relaxed"
                    >
                      Mark this group as a guest group. Guest users will have
                      limited access permissions and restricted functionality
                      within the workspace.
                    </p>
                    {field.value && (
                      <div className="flex items-center space-x-2 rounded bg-dynamic-orange/10 px-2 py-1 text-dynamic-orange text-xs">
                        <svg
                          className="h-3 w-3"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          role="img"
                          aria-label="Info"
                        >
                          <title>Info icon</title>
                          <path
                            fillRule="evenodd"
                            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                            clipRule="evenodd"
                          />
                        </svg>
                        <span>This group will have restricted permissions</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
