'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarIcon, RotateCcw } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Calendar } from '@tuturuuu/ui/calendar';
import { Checkbox } from '@tuturuuu/ui/checkbox';
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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const formSchema = z.object({
  start_date: z.date({
    message: 'Start date is required',
  }),
  days_of_week: z
    .array(z.number())
    .min(1, 'Select at least one day of the week'),
});

type FormValues = z.infer<typeof formSchema>;

interface RecurringScheduleDialogProps {
  wsId: string;
  groupId: string;
  endingDate?: string | null;
  trigger?: React.ReactNode;
  onScheduleCreated?: () => void;
}

export default function RecurringScheduleDialog({
  wsId,
  groupId,
  endingDate,
  trigger,
  onScheduleCreated,
}: RecurringScheduleDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      start_date: new Date(),
      days_of_week: [],
    },
  });

  // Days of week - Monday to Sunday (1-7, where 1 is Monday)
  const daysOfWeek = [
    { value: 1, label: t('common.days_of_week.monday') },
    { value: 2, label: t('common.days_of_week.tuesday') },
    { value: 3, label: t('common.days_of_week.wednesday') },
    { value: 4, label: t('common.days_of_week.thursday') },
    { value: 5, label: t('common.days_of_week.friday') },
    { value: 6, label: t('common.days_of_week.saturday') },
    { value: 0, label: t('common.days_of_week.sunday') }, // Sunday is 0 in JS
  ];

  const generateRecurringDates = (
    startDate: Date,
    endDate: Date,
    daysOfWeek: number[]
  ): string[] => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
    if (start > end) return [];

    // Hard caps to prevent pathological workloads (and overly large session arrays).
    const MAX_RANGE_DAYS = 366 * 5;
    const MAX_OCCURRENCES = 5000;
    const rangeDays = dayjs(end).diff(dayjs(start), 'day');
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new Error('Recurring date range too large');
    }

    const uniqueDays = [...new Set(daysOfWeek)];
    const result = new Set<string>();

    const startDay = start.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

    for (const targetDay of uniqueDays) {
      const offset = (targetDay - startDay + 7) % 7;
      let current = new Date(start);
      current.setDate(current.getDate() + offset);

      while (current <= end) {
        result.add(dayjs(new Date(current)).format('YYYY-MM-DD'));
        if (result.size > MAX_OCCURRENCES) {
          throw new Error('Too many recurring dates generated');
        }
        const next = new Date(current);
        next.setDate(next.getDate() + 7);
        current = next;
      }
    }

    return Array.from(result).sort();
  };

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!endingDate) {
        throw new Error(t('ws-user-group-schedule.no_end_date_set'));
      }

      const supabase = createClient();

      // Generate all dates from start_date to ending_date for selected days of week
      const recurringDates = generateRecurringDates(
        values.start_date,
        new Date(endingDate),
        values.days_of_week
      );

      // Fetch existing sessions
      const { data: groupData, error: fetchError } = await supabase
        .from('workspace_user_groups')
        .select('sessions')
        .eq('ws_id', wsId)
        .eq('id', groupId)
        .single();

      if (fetchError) throw fetchError;

      // Merge with existing sessions (avoid duplicates)
      const existingSessions = new Set(groupData?.sessions || []);
      recurringDates.forEach((date) => {
        existingSessions.add(date);
      });

      // Update the sessions
      const { error } = await supabase
        .from('workspace_user_groups')
        .update({ sessions: Array.from(existingSessions) })
        .eq('ws_id', wsId)
        .eq('id', groupId);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t('ws-user-group-schedule.recurring_schedule_created'));
      setOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ['group-schedule', groupId] });
      router.refresh();
      onScheduleCreated?.();
    },
    onError: (error) => {
      console.error('Error creating recurring schedule:', error);
      toast.error(t('ws-user-group-schedule.failed_to_create_schedule'));
    },
  });

  const onSubmit = (values: FormValues) => {
    if (!endingDate) {
      toast.error(t('ws-user-group-schedule.no_end_date_set'));
      return;
    }
    mutation.mutate(values);
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
              'border-dynamic-green/20 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20'
            )}
          >
            <RotateCcw className="h-5 w-5" />
            {t('ws-user-group-schedule.set_recurring_schedule')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('ws-user-group-schedule.set_recurring_schedule')}
          </DialogTitle>
          <DialogDescription>
            {t('ws-user-group-schedule.set_recurring_schedule_description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="start_date"
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
                            dayjs(field.value).format('DD MMMM YYYY')
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
                        disabled={(date) => {
                          const today = new Date(
                            new Date().setHours(0, 0, 0, 0)
                          );
                          const maxDate = endingDate
                            ? new Date(endingDate)
                            : null;
                          return (
                            date < today || (maxDate ? date > maxDate : false)
                          );
                        }}
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
              name="days_of_week"
              render={() => (
                <FormItem>
                  <div className="mb-4">
                    <FormLabel className="text-base">
                      {t('ws-user-group-schedule.days_of_week')}
                    </FormLabel>
                    <FormDescription>
                      {t('ws-user-group-schedule.days_of_week_help')}
                    </FormDescription>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {daysOfWeek.map((day) => (
                      <FormField
                        key={day.value}
                        control={form.control}
                        name="days_of_week"
                        render={({ field }) => {
                          return (
                            <FormItem
                              key={day.value}
                              className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-3"
                            >
                              <FormControl>
                                <Checkbox
                                  checked={field.value?.includes(day.value)}
                                  onCheckedChange={(checked) => {
                                    return checked
                                      ? field.onChange([
                                          ...field.value,
                                          day.value,
                                        ])
                                      : field.onChange(
                                          field.value?.filter(
                                            (value) => value !== day.value
                                          )
                                        );
                                  }}
                                />
                              </FormControl>
                              <FormLabel className="cursor-pointer font-normal">
                                {day.label}
                              </FormLabel>
                            </FormItem>
                          );
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {endingDate && (
              <div className="rounded-md border border-dynamic-blue/20 bg-dynamic-blue/10 p-3">
                <p className="font-medium text-dynamic-blue text-sm">
                  {t('ws-user-group-schedule.schedule_will_run_until')}:{' '}
                  {dayjs(endingDate).format('DD MMMM YYYY')}
                </p>
              </div>
            )}

            {!endingDate && (
              <div className="rounded-md border border-dynamic-red/20 bg-dynamic-red/10 p-3">
                <p className="font-medium text-dynamic-red text-sm">
                  {t('ws-user-group-schedule.no_end_date_warning')}
                </p>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={mutation.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                disabled={mutation.isPending || !endingDate}
              >
                {mutation.isPending
                  ? t('common.creating')
                  : t('ws-user-group-schedule.create_schedule')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
