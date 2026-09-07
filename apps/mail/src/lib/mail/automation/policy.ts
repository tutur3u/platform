import { z } from 'zod';

export const mailAutomationSchema = z.object({
  forwarding: z
    .discriminatedUnion('mode', [
      z.object({ mode: z.literal('off') }),
      z.object({ mode: z.literal('catch_all') }),
      z.object({
        mode: z.literal('mailbox'),
        address: z.string().trim().toLowerCase().email().max(254),
      }),
    ])
    .default({ mode: 'off' }),
  smartLabelsEnabled: z.boolean().default(false),
});

export function readMailAutomation(
  metadata: Record<string, unknown> | null | undefined
) {
  const result = mailAutomationSchema.safeParse(metadata?.mail_automation);
  return result.success ? result.data : mailAutomationSchema.parse({});
}

export const MAIL_LABEL_MODEL = 'gemini-3.5-flash-lite';
