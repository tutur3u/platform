'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { z } from 'zod';

export const EVENT_AI_FORM_SCHEMA = z.object({
  prompt: z.string().min(1, 'Please enter a prompt to generate an event'),
  timezone: z
    .string()
    .default(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
  smart_scheduling: z.boolean().default(true),
});

export type EventAiFormValues = z.infer<typeof EVENT_AI_FORM_SCHEMA>;

/** The AI generate prompt form, in the user's current time zone. */
export function useEventAiForm(timezone: string) {
  return useForm({
    resolver: zodResolver(EVENT_AI_FORM_SCHEMA),
    defaultValues: {
      prompt: '',
      timezone,
      smart_scheduling: true,
    },
  });
}

export type EventAiForm = ReturnType<typeof useEventAiForm>;
