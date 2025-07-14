'use client';

import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
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
  FormDescription,
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
import { Switch } from '@tuturuuu/ui/switch';
import dayjs from 'dayjs';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

const convertToTimetz = (hour?: number, offset?: number) => {
  if (!hour || !offset) return undefined;

  // Use offset to determine the sign
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);

  // Convert offset to hours and minutes
  const offsetHours = Math.floor(absOffset);
  const offsetMinutes = Math.round((absOffset - offsetHours) * 60);

  const paddedHour = hour.toString().padStart(2, '0');
  const paddedOffsetHours = offsetHours.toString().padStart(2, '0');
  const paddedOffsetMinutes = offsetMinutes.toString().padStart(2, '0');

  return `${paddedHour}:00:00${sign}${paddedOffsetHours}:${paddedOffsetMinutes}`;
};

interface Props {
  plan: {
    dates?: Date[];
    startTime?: number;
    endTime?: number;
    timezone?: Timezone;
    wsId: string;
  };
}

const FormSchema = z.object({
  name: z.string().min(1).max(255),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  dates: z.array(z.string()).optional(),
  is_public: z.boolean().default(true),
});

export default function CreatePlanDialog({ plan }: Props) {
  const t = useTranslations('meet-together');
  const router = useRouter();
  const params = useParams();
  const wsId = params.wsId as string;

  const [isOpened, setIsOpened] = useState(false);
  const [creating, setCreating] = useState(false);

  const form = useForm({
    resolver: zodResolver(FormSchema),
    values: {
      name: t('untitled_plan'),
      start_time: convertToTimetz(plan.startTime, plan.timezone?.offset),
      end_time: convertToTimetz(plan.endTime, plan.timezone?.offset),
      dates: plan.dates
        ?.sort((a, b) => a.getTime() - b.getTime())
        ?.map((date) => dayjs(date).format('YYYY-MM-DD')),
      is_public: true,
    },
  });

  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;

  const disabled = !isValid || isSubmitting;

  const handleSubmit = async () => {
    setCreating(true);

    const data = form.getValues();
    let hasError = false;

    if (!data.start_time) {
      toast({
        title: t('missing_fields'),
        description: t('start_time_required'),
      });
      hasError = true;
    }

    if (!data.end_time) {
      toast({
        title: t('missing_fields'),
        description: t('end_time_required'),
      });
      hasError = true;
    }

    if (!data.dates) {
      toast({
        title: t('missing_fields'),
        description: t('dates_required'),
      });
      hasError = true;
    }

    if (hasError) {
      setCreating(false);
      return;
    }

    // Include workspace ID in the request
    const requestData = {
      ...data,
      ws_id: wsId,
    };

    const res = await fetch(`/api/v1/workspaces/${wsId}/tumeet/plans`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });

    if (res.ok) {
      const { id } = await res.json();
      const normalizedId = id.replace(/-/g, '');
      router.push(`/${wsId}/tumeet/plans/${normalizedId}`);
      router.refresh();
    } else {
      setCreating(false);
      toast({
        title: t('something_went_wrong'),
        description: t('cant_create_plan_right_now'),
      });
    }
  };

  const isDisabled = !plan.dates?.length || !plan.startTime || !plan.endTime;

  return (
    <Dialog open={isOpened} onOpenChange={setIsOpened}>
      <DialogTrigger asChild>
        <Button
          className="col-span-full"
          disabled={isDisabled}
          variant="outline"
        >
          {t('create_plan')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('new_plan')}</DialogTitle>
          <DialogDescription>{t('new_plan_desc')}</DialogDescription>
        </DialogHeader>

        <Separator />

        <Form {...form}>
          <form className="space-y-3">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('untitled_plan')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_public"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">
                      Make plan public
                    </FormLabel>
                    <FormDescription>
                      Allow anyone with the link to view and join this plan.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsOpened(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={disabled || creating}>
            {creating ? t('creating_plan') : t('create_plan')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
