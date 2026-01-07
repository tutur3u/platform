'use client';

import { zodResolver } from '@hookform/resolvers/zod';
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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

const formSchema = z.object({
  ending_date: z.date({
    message: 'End date is required',
  }),
});

type FormValues = z.infer<typeof formSchema>;

interface EditEndDateDialogProps {
  wsId: string;
  groupId: string;
  currentEndDate?: string | null;
  trigger?: React.ReactNode;
}

export default function EditEndDateDialog({
  wsId,
  groupId,
  currentEndDate,
  trigger,
}: EditEndDateDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ending_date: currentEndDate ? new Date(currentEndDate) : undefined,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    try {
      const supabase = createClient();

      const formattedDate = dayjs(values.ending_date).format('YYYY-MM-DD');

      const { error } = await supabase
        .from('workspace_user_groups')
        .update({ ending_date: formattedDate })
        .eq('ws_id', wsId)
        .eq('id', groupId);

      if (error) throw error;

      toast.success(t('ws-user-group-schedule.end_date_updated'));
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Error updating end date:', error);
      toast.error(t('ws-user-group-schedule.failed_to_update_end_date'));
    } finally {
      setIsSubmitting(false);
    }
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
            {t('ws-user-group-schedule.set_end_date')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ws-user-group-schedule.set_end_date')}</DialogTitle>
          <DialogDescription>
            {t('ws-user-group-schedule.set_end_date_description')}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
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
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? t('common.saving') : t('common.save')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
