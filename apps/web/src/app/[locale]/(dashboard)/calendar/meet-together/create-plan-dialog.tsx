'use client';

import { Timezone } from '@/types/primitives/Timezone';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@repo/ui/components/ui/form';
import { Input } from '@repo/ui/components/ui/input';
import { toast } from '@repo/ui/hooks/use-toast';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

interface Props {
  plan: {
    dates: Date[] | undefined;
    startTime: number | undefined;
    endTime: number | undefined;
    timezone: Timezone | undefined;
  };
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

export default function CreatePlanDialog({ plan }: Props) {
  const t = useTranslations('meet-together');
  const router = useRouter();

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme?.includes('dark');

  const [isOpened, setIsOpened] = useState(false);
  const [creating, setCreating] = useState(false);

  const form = useForm<z.infer<typeof FormSchema>>({
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

    const res = await fetch('/api/meet-together/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    });

    if (res.ok) {
      const { id } = await res.json();
      const normalizedId = id.replace(/-/g, '');
      router.push(`/calendar/meet-together/plans/${normalizedId}`);
      router.refresh();
    } else {
      setCreating(false);
      toast({
        title: t('something_went_wrong'),
        description: t('cant_create_plan_right_now'),
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
          className={`${
            missingFields || creating
              ? 'cursor-not-allowed opacity-30'
              : 'cursor-pointer'
          } group relative inline-flex w-full`}
          onClick={() => setIsOpened(true)}
          disabled={missingFields || creating}
        >
          <div
            className={`${
              isDark
                ? 'from-rose-400/60 to-orange-300/60'
                : 'from-rose-400 to-orange-300 dark:from-rose-400/60 dark:to-orange-300/60'
            } ${
              missingFields || creating
                ? 'opacity-30'
                : 'group-hover:-inset-1 group-hover:opacity-100'
            } animate-tilt absolute -inset-px rounded-lg bg-gradient-to-r blur-lg transition-all duration-500`}
          />
          <div
            className={`${
              isDark
                ? 'from-rose-400/60 to-orange-300/60'
                : 'from-rose-400 to-orange-300 dark:from-rose-400/60 dark:to-orange-300/60'
            } relative inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r px-8 py-2 font-bold text-white transition-all md:text-lg`}
          >
            {t('create_plan')}
          </div>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
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
