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
  timestamp: z.string().datetime(),
  context: dynamicMetadataSchema,
  attachment: dynamicMetadataSchema.optional(),
});

export const externalChatSettingsSchema = z.object({
  enabled: z.boolean(),
  bridgeBaseUrl: z.string().url().max(2048),
  agentMappings: z.record(z.string(), z.string().max(255)).default({}),
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
