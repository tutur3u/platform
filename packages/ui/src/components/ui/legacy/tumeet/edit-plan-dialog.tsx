'use client';

import { deletePlan, updatePlan } from '@tuturuuu/apis/tumeet/actions';
import { Pencil } from '@tuturuuu/icons';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { Separator } from '@tuturuuu/ui/separator';
import { parseTimeFromTimetz } from '@tuturuuu/utils/time-helper';
import timezones from '@tuturuuu/utils/timezones';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';
import DateSelector from './date-selector';
import { TimeSelector } from './time-selector';
import TimezoneSelector from './timezone-selector';

interface Props {
  plan: MeetTogetherPlan;
  onSuccess?: () => void;
  onEditingChange?: (isEditing: boolean) => void;
}

const FormSchema = z
  .object({
    name: z.string(),
    start_time: z.string().min(1, { message: 'Start time is required' }),
    end_time: z.string().min(1, { message: 'End time is required' }),
    dates: z
      .array(z.string())
      .min(1, { message: 'At least one date is required' }),
    is_public: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // Custom validation to ensure end_time is after start_time
      if (!data.start_time || !data.end_time) return true; // Let individual field validation handle this

      const startHour = parseTimeFromTimetz(data.start_time);
      const endHour = parseTimeFromTimetz(data.end_time);

      if (startHour === undefined || endHour === undefined) return true; // Let individual field validation handle this

      return endHour > startHour;
    },
    {
      message: 'End time must be after start time',
      path: ['end_time'], // This will show the error on the end_time field
    }
  );

// Utility function to parse timezone offset from timetz format (e.g., "09:00:00+00")
const parseTimezoneFromTimetz = (
  timetz: string | undefined
): number | undefined => {
  if (!timetz) return undefined;
  const offsetMatch = timetz.match(/[+-]\d+$/);
  if (!offsetMatch) return undefined;
  const offset = parseInt(offsetMatch[0], 10);
  return offset;
};

// Utility function to convert time to timetz format
const convertToTimetz = (
  time: number | undefined,
  utcOffset: number | undefined
) => {
  if (!time || utcOffset === undefined) return undefined;
  // Convert 24 back to 0 for the timetz format
  const hour = time === 24 ? 0 : time;
  // Pad the offset with leading zero for single digits
  const paddedOffset = Math.abs(utcOffset).toString().padStart(2, '0');
  return `${hour}:00:00${utcOffset < 0 ? '-' : '+'}${paddedOffset}`;
};

export default function EditPlanDialog({
  plan,
  onEditingChange,
  onSuccess,
}: Props) {
  const t = useTranslations();
  const router = useRouter();

  const [isOpened, setIsOpened] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Parse plan data once for form initialization
  const parsedStartTime = plan.start_time
    ? parseTimeFromTimetz(plan.start_time)
    : 9;
  const parsedEndTime = plan.end_time ? parseTimeFromTimetz(plan.end_time) : 17;
  const parsedDates = plan.dates
    ? plan.dates.map((dateStr: string) => new Date(dateStr))
    : [];
  const parsedTimezone = plan.start_time
    ? (() => {
        const offset = parseTimezoneFromTimetz(plan.start_time);
        return offset !== undefined
          ? timezones.find((tz) => tz.offset === offset)
          : undefined;
      })()
    : undefined;

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: plan.name || t('meet-together.untitled_plan'),
      start_time:
        convertToTimetz(parsedStartTime, parsedTimezone?.offset) || '',
      end_time: convertToTimetz(parsedEndTime, parsedTimezone?.offset) || '',
      dates: parsedDates
        .sort((a: Date, b: Date) => a.getTime() - b.getTime())
        .map((date: Date) => dayjs(date).format('YYYY-MM-DD')),
      is_public: true,
    },
  });

  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isValid || isSubmitting;
  const watchedName = form.watch('name');
  const watchedStartTime = form.watch('start_time');
  const watchedEndTime = form.watch('end_time');
  const watchedDates = form.watch('dates');

  // Convert form values back to component-friendly formats
  const currentStartTime = watchedStartTime
    ? parseTimeFromTimetz(watchedStartTime)
    : parsedStartTime;
  const currentEndTime = watchedEndTime
    ? parseTimeFromTimetz(watchedEndTime)
    : parsedEndTime;
  const currentDatesArray =
    watchedDates && watchedDates.length > 0
      ? watchedDates.map((dateStr: string) => new Date(dateStr))
      : parsedDates;
  const currentTimezone = watchedStartTime
    ? (() => {
        const offset = parseTimezoneFromTimetz(watchedStartTime);
        return offset !== undefined
          ? timezones.find((tz) => tz.offset === offset)
          : parsedTimezone;
      })()
    : parsedTimezone;

  const originalDatesString = JSON.stringify(
    plan.dates?.map((date) => dayjs(date).format('YYYY-MM-DD')).sort()
  );
  const newDatesString = JSON.stringify(watchedDates?.sort());

  // Check if any form values have changed by comparing with original plan values
  const hasChanges =
    plan.name !== watchedName ||
    originalDatesString !== newDatesString ||
    plan.start_time !== watchedStartTime ||
    plan.end_time !== watchedEndTime;

  const handleSubmit = async () => {
    if (!plan.id) {
      toast({
        title: t('meet-together-plan-details.something_went_wrong'),
        description: 'Plan ID is missing',
      });
      return;
    }

    setUpdating(true);

    const data = form.getValues();
    let hasError = false;

    // Validate required fields
    if (!data.start_time) {
      toast({
        title: t('meet-together.missing_fields'),
        description: t('meet-together.start_time_required'),
      });
      hasError = true;
    }

    if (!data.end_time) {
      toast({
        title: t('meet-together.missing_fields'),
        description: t('meet-together.end_time_required'),
      });
      hasError = true;
    }

    if (!data.dates || data.dates.length === 0) {
      toast({
        title: t('meet-together.missing_fields'),
        description: t('meet-together.dates_required'),
      });
      hasError = true;
    }

    if (hasError) {
      setUpdating(false);
      return;
    }

    const result = await updatePlan(plan.id, data);

    if (result.data) {
      onSuccess?.();
      router.refresh();
      setUpdating(false);
      setIsOpened(false);
    } else {
      setUpdating(false);
      toast({
        title: t('meet-together-plan-details.something_went_wrong'),
        description:
          result.error ||
          t('meet-together-plan-details.cant_update_plan_right_now'),
      });
    }
  };

  const handleDelete = async () => {
    if (!plan.id) {
      toast({
        title: t('meet-together-plan-details.something_went_wrong'),
        description: 'Plan ID is missing',
      });
      return;
    }

    setDeleting(true);
    try {
      const result = await deletePlan(plan.id);

      if (result.data) {
        router.push('/meet-together');
      } else {
        toast({
          title: t('meet-together-plan-details.something_went_wrong'),
          description:
            result.error ||
            t('meet-together-plan-details.cant_delete_plan_right_now'),
        });
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <span className="group relative">
      <Dialog
        open={isOpened}
        onOpenChange={(open) => {
          if (!open) {
            form.reset();
          }
          setIsOpened(open);
          onEditingChange?.(open);
        }}
      >
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="hover:bg-card/50">
            <Pencil size={24} />
          </Button>
        </DialogTrigger>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {t('meet-together-plan-details.update_plan')}
            </DialogTitle>
            <DialogDescription>
              {t('meet-together-plan-details.update_plan_desc')}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      {t('meet-together-plan-details.name')}
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="Name" autoComplete="off" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Separator className="my-4" />

              {/* Date Selector */}
              <div className="flex flex-col items-center justify-center gap-2">
                <p className="font-semibold">
                  {t('meet-together.dates-to-meet-together')}
                </p>
                <div>
                  <DateSelector
                    value={currentDatesArray}
                    onSelect={(newDates) => {
                      if (newDates && Array.isArray(newDates)) {
                        const sortedDates = newDates
                          .sort((a: Date, b: Date) => a.getTime() - b.getTime())
                          .map((date: Date) =>
                            dayjs(date).format('YYYY-MM-DD')
                          );
                        form.setValue('dates', sortedDates);
                      }
                    }}
                    className="bg-background/50"
                  />
                </div>
              </div>

              <Separator className="my-4" />

              {/* Time and Timezone Controls */}
              <div className="space-y-4">
                <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="start_time"
                    render={() => (
                      <FormItem>
                        <FormLabel>
                          {t('meet-together.soonest-time-to-meet')}
                        </FormLabel>
                        <FormControl>
                          <TimeSelector
                            value={currentStartTime}
                            onValueChange={(newStartTime) => {
                              form.setValue(
                                'start_time',
                                convertToTimetz(
                                  newStartTime,
                                  currentTimezone?.offset
                                ) || ''
                              );
                            }}
                            disabledTime={currentEndTime}
                            isStartTime={true}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="end_time"
                    render={() => (
                      <FormItem>
                        <FormLabel>
                          {t('meet-together.latest-time-to-meet')}
                        </FormLabel>
                        <FormControl>
                          <TimeSelector
                            value={currentEndTime}
                            onValueChange={(newEndTime) => {
                              form.setValue(
                                'end_time',
                                convertToTimetz(
                                  newEndTime,
                                  currentTimezone?.offset
                                ) || ''
                              );
                            }}
                            disabledTime={currentStartTime}
                            isStartTime={false}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Separator className="my-2" />
                <div className="grid w-full gap-1">
                  <FormLabel>{t('meet-together.time-zone')}</FormLabel>
                  <TimezoneSelector
                    value={currentTimezone}
                    onValueChange={(newTimezone) => {
                      // Update both start and end times with new timezone
                      form.setValue(
                        'start_time',
                        convertToTimetz(
                          currentStartTime,
                          newTimezone?.offset
                        ) || ''
                      );
                      form.setValue(
                        'end_time',
                        convertToTimetz(currentEndTime, newTimezone?.offset) ||
                          ''
                      );
                    }}
                  />
                </div>
              </div>

              <DialogFooter>
                <div className="grid w-full gap-2">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={!hasChanges || disabled || updating || deleting}
                  >
                    {updating
                      ? t('meet-together-plan-details.updating_plan')
                      : t('meet-together-plan-details.update_plan')}
                  </Button>

                  <Separator />

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        className="w-full"
                        variant="destructive"
                        disabled={disabled || updating || deleting}
                      >
                        {deleting
                          ? t('meet-together-plan-details.deleting_plan')
                          : t('meet-together-plan-details.delete_plan')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t(
                            'meet-together-plan-details.are_you_absolutely_sure'
                          )}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('meet-together-plan-details.delete_plan_warning')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete}>
                          {t('common.continue')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </span>
  );
}
