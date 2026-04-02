'use client';

import type { Timezone } from '@ncthub/types/primitives/Timezone';
import { Button } from '@ncthub/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@ncthub/ui/form';
import { useForm } from '@ncthub/ui/hooks/use-form';
import { toast } from '@ncthub/ui/hooks/use-toast';
import { Input } from '@ncthub/ui/input';
import { zodResolver } from '@ncthub/ui/resolvers';
import { Switch } from '@ncthub/ui/switch';
import { ToastAction } from '@ncthub/ui/toast';
import { cn } from '@ncthub/utils/format';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';
import { MAX_MEETING_PLANS } from '@/constants/meet-together';

interface Props {
  plan: {
    dates: Date[] | undefined;
    startTime: number | undefined;
    endTime: number | undefined;
    timezone: Timezone | undefined;
  };
  createdPlanCount: number;
  isLoggedIn: boolean;
}

const FormSchema = z.object({
  name: z.string(),
  // start_time and end_time are time with timezone offset
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  dates: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
});

const convertToTimetz = (
  time: number | undefined,
  utcOffset: number | undefined
) => {
  if (!time || !utcOffset) return undefined;
  return `${time}:00${utcOffset < 0 ? '-' : '+'}${Math.abs(utcOffset)}`;
};

export default function CreatePlanDialog({
  plan,
  createdPlanCount,
  isLoggedIn,
}: Props) {
  const t = useTranslations('meet-together');
  const router = useRouter();

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
  const hasReachedPlanLimit = createdPlanCount >= MAX_MEETING_PLANS;

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      toast({
        title: t('login_required_title'),
        description: t('login_required_desc'),
        action: (
          <ToastAction
            altText={t('login_action')}
            onClick={() => router.push('/login')}
          >
            {t('login_action')}
          </ToastAction>
        ),
      });
      return;
    }

    if (hasReachedPlanLimit) {
      toast({
        title: t('plan_limit_reached_title'),
        description: t('plan_limit_reached_desc', {
          limit: MAX_MEETING_PLANS,
        }),
      });
      return;
    }

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

    const res = await fetch('/api/meet-together/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const { id } = await res.json();
      const normalizedId = id.replace(/-/g, '');
      router.push(`/meet-together/plans/${normalizedId}`);
      router.refresh();
    } else {
      const payload = await res.json().catch(() => null);
      setCreating(false);

      if (res.status === 401) {
        toast({
          title: t('login_required_title'),
          description: payload?.message || t('login_required_desc'),
          action: (
            <ToastAction
              altText={t('login_action')}
              onClick={() => router.push('/login')}
            >
              {t('login_action')}
            </ToastAction>
          ),
        });
        return;
      }

      if (res.status === 409) {
        toast({
          title: t('plan_limit_reached_title'),
          description:
            payload?.message ||
            t('plan_limit_reached_desc', { limit: MAX_MEETING_PLANS }),
        });
        return;
      }

      toast({
        title: t('something_went_wrong'),
        description: payload?.message || t('cant_create_plan_right_now'),
      });
    }
  };

  const missingFields =
    !plan.startTime || !plan.endTime || !plan.timezone || !plan.dates?.length;

  return (
    <Dialog
      open={isOpened}
      onOpenChange={(open) => {
        if (!open) form.reset();
        setIsOpened(open);
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'group relative col-span-full mt-4 inline-flex w-full',
            missingFields || creating
              ? 'cursor-not-allowed opacity-30'
              : 'cursor-pointer'
          )}
          onClick={() => setIsOpened(true)}
          disabled={missingFields || creating}
        >
          <div
            className={cn(
              'absolute -inset-px animate-tilt rounded-lg bg-linear-to-r from-dynamic-light-red/80 via-dynamic-light-pink/80 to-dynamic-light-blue/80 opacity-70 blur-lg transition-all',
              missingFields ||
                creating ||
                'group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200'
            )}
          />
          <div className="relative inline-flex w-full items-center justify-center rounded-lg bg-linear-to-r from-dynamic-light-red/60 via-dynamic-light-pink/60 to-dynamic-light-blue/60 px-8 py-2 font-bold text-white transition-all md:text-lg">
            {t('create_plan')}
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-106.25">
        <DialogHeader>
          <DialogTitle>{t('new_plan')}</DialogTitle>
          <DialogDescription>{t('new_plan_desc')}</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-3"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input placeholder="Name" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_public"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="space-y-1">
                      <FormLabel>{t('public_plan')}</FormLabel>
                      <p className="text-muted-foreground text-sm">
                        {t('public_plan_desc')}
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="submit"
                className="w-full"
                disabled={disabled || creating}
              >
                {creating ? t('creating_plan') : t('create_plan')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
