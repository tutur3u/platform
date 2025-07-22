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
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { MapPin, Sparkles } from 'lucide-react';
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
    wsId?: string;
  };
}

const FormSchema = z.object({
  name: z.string(),
  // start_time and end_time are time with timezone offset
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  dates: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
  ws_id: z.string().optional(),
  where_to_meet: z.boolean().optional(), // <-- Added field
});

const convertToTimetz = (
  time: number | undefined,
  utcOffset: number | undefined
) => {
  if (!time || utcOffset === undefined) return undefined;
  return `${time}:00${utcOffset < 0 ? '-' : '+'}${Math.abs(utcOffset)}`;
};

export default function CreatePlanDialog({ plan }: Props) {
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
      ws_id: plan.wsId,
      where_to_meet: false, // <-- Default value
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
              'animate-tilt absolute -inset-px rounded-lg bg-linear-to-r from-dynamic-light-red/80 via-dynamic-light-pink/80 to-dynamic-light-blue/80 opacity-70 blur-lg transition-all',
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('new_plan')}</DialogTitle>
          <DialogDescription>{t('new_plan_desc')}</DialogDescription>
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
                  <FormLabel>{t('name')}</FormLabel>
                  <FormControl>
                    <Input placeholder="Name" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator className="my-6" />

            {/* Extra Features Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <h3 className="text-sm font-semibold text-foreground">
                  Extra Features
                </h3>
              </div>
              <p className="text-xs text-muted-foreground">
                Enhance your meeting plan with additional features to make
                coordination easier.
              </p>

              {/* Where-to-meet feature */}
              <FormField
                control={form.control}
                name="where_to_meet"
                render={({ field }) => (
                  <FormItem>
                    <div
                      className="cursor-pointer rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
                      onClick={() => field.onChange(!field.value)}
                    >
                      <div className="flex items-start space-x-3">
                        <FormControl>
                          <input
                            type="checkbox"
                            id="where_to_meet"
                            checked={field.value}
                            onChange={field.onChange}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </FormControl>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-blue-500" />
                            <FormLabel
                              htmlFor="where_to_meet"
                              className="mb-0 cursor-pointer font-medium text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Where TuMeet?
                            </FormLabel>
                          </div>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Enable location suggestions and voting. Participants
                            can propose meeting locations and vote on their
                            preferred spots, making it easier to find the
                            perfect place for everyone.
                          </p>
                          <div className="flex items-center gap-1 text-xs text-blue-600">
                            <span>✨ Popular feature</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Placeholder for future features */}
              <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-4">
                <div className="flex items-center justify-center text-center">
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Sparkles className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        More features coming soon!
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      We&apos;re working on additional features to make your
                      meetings even better.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4">
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
