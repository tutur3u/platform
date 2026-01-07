'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarIcon } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { type SubmitHandler, useForm } from 'react-hook-form';
import { z } from 'zod';

const formSchema = z
  .object({
    starting_date: z.date({
      message: 'Start date is required',
    }),
    ending_date: z.date({
      message: 'End date is required',
    }),
  })
  .refine((data) => data.ending_date >= data.starting_date, {
    message: 'End date must be after or equal to start date',
    path: ['ending_date'],
  });

type FormValues = z.infer<typeof formSchema>;

interface EditEndDateDialogProps {
  wsId: string;
  groupId: string;
  currentStartDate?: string | null;
  currentEndDate?: string | null;
  trigger?: React.ReactNode;
}

export default function EditEndDateDialog({
  wsId,
  groupId,
  currentStartDate,
  currentEndDate,
  trigger,
}: EditEndDateDialogProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      starting_date: currentStartDate ? new Date(currentStartDate) : new Date(),
      ending_date: currentEndDate ? new Date(currentEndDate) : undefined,
    },
  });

  const updateDatesMutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const supabase = createClient();

      const formattedStartDate = dayjs(values.starting_date).format(
        'YYYY-MM-DD'
      );
      const formattedEndDate = dayjs(values.ending_date).format('YYYY-MM-DD');

      const { error } = await supabase
        .from('workspace_user_groups')
        .update({
          starting_date: formattedStartDate,
          ending_date: formattedEndDate,
        })
        .eq('ws_id', wsId)
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      setOpen(false);
      queryClient.invalidateQueries({
        queryKey: ['workspaces', wsId, 'users', 'groups', groupId, 'sessions'],
      });
      queryClient.invalidateQueries({ queryKey: ['group-schedule', groupId] });
      toast.success(t('ws-user-group-schedule.dates_updated'));
    },
    onError: () => {
      toast.error(t('ws-user-group-schedule.failed_to_update_dates'));
    },
  });

  const onSubmit: SubmitHandler<FormValues> = (values) => {
    updateDatesMutation.mutate(values);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            type="button"
            variant="outline"
            className={cn(
              'border font-semibold',
              'border-dynamic-purple/20 bg-dynamic-purple/10 text-dynamic-purple hover:bg-dynamic-purple/20'
            )}
          >
            <CalendarIcon className="h-5 w-5" />
            {t('ws-user-group-schedule.set_dates')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ws-user-group-schedule.set_dates')}</DialogTitle>
          <DialogDescription>
            {t('ws-user-group-schedule.set_dates_description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="starting_date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>
                    {t('ws-user-group-schedule.start_date')}
                  </FormLabel>
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
                            <span>{t('common.pick_a_date')}</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    {t('ws-user-group-schedule.start_date_help')}
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
                  <FormLabel>{t('ws-user-group-schedule.end_date')}</FormLabel>
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
                            <span>{t('common.pick_a_date')}</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          form.getValues('starting_date') &&
                          date < form.getValues('starting_date')
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    {t('ws-user-group-schedule.end_date_help')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={updateDatesMutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={updateDatesMutation.isPending}>
                {updateDatesMutation.isPending
                  ? t('common.saving')
                  : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
