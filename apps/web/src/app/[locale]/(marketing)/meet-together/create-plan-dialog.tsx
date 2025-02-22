'use client';

import { Timezone } from '@tuturuuu/types/primitives/Timezone';
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
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
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
      router.push(`/meet-together/plans/${normalizedId}`);
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
              'animate-tilt absolute -inset-px rounded-lg bg-gradient-to-r from-dynamic-light-red/80 via-dynamic-light-pink/80 to-dynamic-light-blue/80 opacity-70 blur-lg transition-all',
              missingFields ||
                creating ||
                'group-hover:-inset-1 group-hover:opacity-100 group-hover:duration-200'
            )}
          />
          <div className="relative inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r from-dynamic-light-red/60 via-dynamic-light-pink/60 to-dynamic-light-blue/60 px-8 py-2 font-bold text-white transition-all md:text-lg">
            {t('create_plan')}
          </div>
        </button>
        {/* <button
          className={`${
            
          } group relative inline-flex w-full`}
          onClick={() => setIsOpened(true)}
          disabled={missingFields || creating}
        >
          <div
            className={cn(
              'from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-gradient-to-r',
              missingFields || creating
                ? 'opacity-10'
                : 'group-hover:opacity-30',
              'absolute rounded-lg blur transition-all duration-500'
            )}
          />
          <div
            className={`from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue relative inline-flex w-full items-center justify-center rounded-lg bg-gradient-to-r px-8 py-2 font-bold text-white transition-all md:text-lg`}
          >
            {t('create_plan')}
          </div>
        </button> */}
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
