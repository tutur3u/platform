'use client';

import { createPlan } from '@tuturuuu/apis/tumeet/actions';
import {
  ClipboardList,
  MapPin as MapPinIcon,
  Sparkles as SparklesIcon,
} from '@tuturuuu/icons';
import type { User } from '@tuturuuu/types';
import type { Timezone } from '@tuturuuu/types/primitives/Timezone';
import type { JSONContent } from '@tuturuuu/types/tiptap';
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
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import * as z from 'zod';

interface Props {
  user: Partial<User> | null;
  plan: {
    dates: Date[] | undefined;
    startTime: number | undefined;
    endTime: number | undefined;
    timezone: Timezone | undefined;
    wsId?: string;
  };
}

const FormSchema = z.object({
  name: z.string().min(1, { message: 'Name is required' }),
  // start_time and end_time are time with timezone offset
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  dates: z.array(z.string()).optional(),
  is_public: z.boolean().optional(),
  ws_id: z.string().optional(),
  agenda_enabled: z.boolean().optional(), // <-- Added field for agenda toggle
  agenda_content: z.custom<JSONContent>().optional(),
  where_to_meet: z.boolean().optional(), // <-- Added field
});

type FormData = z.infer<typeof FormSchema>;

const convertToTimetz = (
  time: number | undefined,
  utcOffset: number | undefined
) => {
  if (!time || utcOffset === undefined) return undefined;

  // Convert decimal offset to HH:MM format for PostgreSQL
  const hours = Math.floor(Math.abs(utcOffset));
  const minutes = Math.round((Math.abs(utcOffset) - hours) * 60);

  // Format time as HH:MM
  const timeStr = `${time.toString().padStart(2, '0')}:00`;

  // Format offset as +/-HH:MM
  const offsetStr = `${utcOffset < 0 ? '-' : '+'}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  return `${timeStr}${offsetStr}`;
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
      agenda_enabled: false, // <-- Default value for agenda toggle
      agenda_content: undefined,
      where_to_meet: false, // <-- Default value
    },
  });

  const isValid = form.formState.isValid;
  const isSubmitting = form.formState.isSubmitting;
  const disabled = !isValid || isSubmitting;

  const handleSubmit = async (data: FormData) => {
    setCreating(true);
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

    const { agenda_enabled: _, ...rest } = data;

    const result = await createPlan(rest);

    if (result.data) {
      const normalizedId = result.data.id.replace(/-/g, '');
      router.push(`/meet-together/plans/${normalizedId}`);
      router.refresh();
    } else {
      setCreating(false);
      toast({
        title: t('something_went_wrong'),
        description: result.error || t('cant_create_plan_right_now'),
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
              '-inset-px absolute animate-tilt rounded-lg bg-linear-to-r from-dynamic-light-red/80 via-dynamic-light-pink/80 to-dynamic-light-blue/80 opacity-70 blur-lg transition-all',
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[800px]">
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
                <SparklesIcon className="h-4 w-4 text-dynamic-purple" />
                <h3 className="font-semibold text-foreground text-sm">
                  Extra Features
                </h3>
              </div>
              <p className="text-muted-foreground text-xs">
                Enhance your meeting plan with additional features to make
                coordination easier.
              </p>

              {/* Where-to-meet feature */}
              <FormField
                control={form.control}
                name="where_to_meet"
                render={({ field }) => (
                  <FormItem>
                    <button
                      type="button"
                      className={cn(
                        'cursor-pointer rounded-lg border p-4 transition-all duration-200',
                        field.value
                          ? 'border-dynamic-blue/30 bg-dynamic-blue/10 ring-1 ring-dynamic-blue/20'
                          : 'border-border bg-muted/30 hover:border-muted-foreground/20 hover:bg-muted/50'
                      )}
                      onClick={() => field.onChange(!field.value)}
                    >
                      <div className="flex items-start space-x-3">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-dynamic-blue focus:ring-dynamic-blue/50"
                          />
                        </FormControl>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <MapPinIcon
                              className={cn(
                                'h-4 w-4 transition-colors',
                                field.value
                                  ? 'text-dynamic-blue'
                                  : 'text-dynamic-blue/70'
                              )}
                            />
                            <FormLabel
                              htmlFor="where_to_meet"
                              className="mb-0 cursor-pointer font-medium text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Where TuMeet?
                            </FormLabel>
                          </div>
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            Enable location suggestions and voting. Participants
                            can propose meeting locations and vote on their
                            preferred spots, making it easier to find the
                            perfect place for everyone.
                          </p>
                          <div className="flex items-center gap-1 text-dynamic-blue text-xs">
                            <SparklesIcon className="h-3 w-3" />
                            <span>Popular feature</span>
                          </div>
                        </div>
                      </div>
                    </button>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Agenda feature */}
              <FormField
                control={form.control}
                name="agenda_enabled"
                render={({ field }) => (
                  <FormItem>
                    <button
                      type="button"
                      className={cn(
                        'cursor-pointer rounded-lg border p-4 transition-all duration-200',
                        field.value
                          ? 'border-dynamic-green/30 bg-dynamic-green/10 ring-1 ring-dynamic-green/20'
                          : 'border-border bg-muted/30 hover:border-muted-foreground/20 hover:bg-muted/50'
                      )}
                      onClick={() => field.onChange(!field.value)}
                    >
                      <div className="flex items-start space-x-3">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="mt-1 h-4 w-4 rounded border-gray-300 text-dynamic-green focus:ring-dynamic-green/50"
                          />
                        </FormControl>
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <ClipboardList
                              className={cn(
                                'h-4 w-4 transition-colors',
                                field.value
                                  ? 'text-dynamic-green'
                                  : 'text-dynamic-green/70'
                              )}
                            />
                            <FormLabel
                              htmlFor="agenda_enabled"
                              className="mb-0 cursor-pointer font-medium text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {t('agenda')}
                            </FormLabel>
                          </div>
                          <p className="text-muted-foreground text-xs leading-relaxed">
                            Add an agenda to keep your meeting organized and on
                            track. Share the plan with participants beforehand
                            so everyone knows what to expect.
                          </p>
                          <div className="flex items-center gap-1 text-dynamic-green text-xs">
                            <SparklesIcon className="h-3 w-3" />
                            <span>Stay organized</span>
                          </div>
                        </div>
                      </div>
                    </button>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Agenda content editor - only shown when enabled */}
              {form.watch('agenda_enabled') && (
                <div className="slide-in-from-top-2 animate-in duration-300">
                  <FormField
                    control={form.control}
                    name="agenda_content"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <div className="rounded-lg border border-dynamic-green/30 bg-dynamic-green/5 p-3">
                            <RichTextEditor
                              content={field.value || null}
                              onChange={field.onChange}
                              readOnly={false}
                              titlePlaceholder={t('agenda_title_placeholder')}
                              writePlaceholder={t('agenda_content_placeholder')}
                              className="h-64 border-0 bg-transparent"
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
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
