import { z } from 'zod';

const dynamicMetadataSchema = z.record(z.string(), z.unknown()).default({});

export const externalChatEventSchema = z.object({
  agentId: z.string().max(255).default(''),
  visitorId: z.string().min(1).max(255),
  visitorProfile: dynamicMetadataSchema,
  messageId: z.string().min(1).max(255),
  direction: z.enum(['visitor', 'staff', 'system']),
  content: z.string().max(10000).default(''),
  contentType: z.union([z.literal(1), z.literal(2)]).default(1),
  status: z.string().max(80).default('sent'),
  timestamp: z
    .string()
    .datetime()
    .refine(
      (value) => new Date(value).getTime() <= Date.now() + 5 * 60_000,
      'Event timestamp is too far in the future'
    ),
  context: dynamicMetadataSchema,
  attachment: dynamicMetadataSchema.optional(),
});

export const externalChatSettingsSchema = z.object({
  enabled: z.boolean(),
  bridgeBaseUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash
      );
    }, 'Bridge URL must be an HTTPS origin without credentials, query, or fragment'),
  agentMappings: z.record(z.string(), z.string().uuid()).default({}),
  inboxDefaults: dynamicMetadataSchema,
  authorityMode: z
    .enum([
      'legacy_primary',
      'mirror_verified',
      'tuturuuu_primary',
      'fallback_queue',
      'paused',
    ])
    .default('legacy_primary'),
});

export type ExternalChatEvent = z.infer<typeof externalChatEventSchema>;
export type ExternalChatSettings = z.infer<typeof externalChatSettingsSchema>;

export function isExternalChatEnabled(settings: unknown) {
  if (!settings || typeof settings !== 'object') return false;
  const chat = (settings as Record<string, unknown>).chat;
  return Boolean(
    chat &&
      typeof chat === 'object' &&
      (chat as Record<string, unknown>).enabled === true
  );
}

export function isExternalChatLiveAuthority(settings: unknown) {
  if (!isExternalChatEnabled(settings)) return false;
  const chat = (settings as Record<string, unknown>).chat as Record<
    string,
    unknown
  >;
  return !['fallback_queue', 'paused'].includes(String(chat.authorityMode));
}
