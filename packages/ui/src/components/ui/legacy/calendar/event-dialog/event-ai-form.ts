'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { useMemo } from 'react';
import { z } from 'zod';

/** The AI prompt form schema, with the localized "prompt required" message. */
export function eventAiFormSchema(promptRequired: string) {
  return z.object({
    prompt: z.string().min(1, promptRequired),
    timezone: z
      .string()
      .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    smart_scheduling: z.boolean().default(true),
  });
}

export type EventAiFormValues = z.infer<ReturnType<typeof eventAiFormSchema>>;

/** The AI generate prompt form, in the user's current time zone. */
export function useEventAiForm(timezone: string, promptRequired: string) {
  const resolver = useMemo(
    () => zodResolver(eventAiFormSchema(promptRequired)),
    [promptRequired]
  );
  return useForm({
    resolver,
    defaultValues: {
      prompt: '',
      timezone,
      smart_scheduling: true,
    },
  });
}

export type EventAiForm = ReturnType<typeof useEventAiForm>;
