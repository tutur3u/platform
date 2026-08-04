import { z } from 'zod';

const MAX_DYNAMIC_METADATA_DEPTH = 16;

const dynamicMetadataObjectSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, context) => {
    if (exceedsDepth(value, MAX_DYNAMIC_METADATA_DEPTH))
      context.addIssue({
        code: 'custom',
        message: 'Dynamic metadata is too deeply nested',
      });
  });
const dynamicMetadataSchema = dynamicMetadataObjectSchema.default({});
const timestampSchema = z
  .string()
  .datetime()
  .refine(
    (value) => new Date(value).getTime() <= Date.now() + 5 * 60_000,
    'Event timestamp is too far in the future'
  );
const deliveryModeSchema = z.enum(['live', 'historical', 'probe']);
const inboxDefaultsSchema = z
  .object({ recipientUserId: z.string().uuid().optional() })
  .catchall(z.unknown())
  .default({});

const messageFieldsSchema = z.object({
  messageId: z.string().min(1).max(255),
  direction: z.enum(['visitor', 'staff', 'system']),
  content: z.string().max(10000).default(''),
  contentType: z.union([z.literal(1), z.literal(2)]).default(1),
  status: z.string().max(80).default('sent'),
  visitorProfile: dynamicMetadataSchema,
  timestamp: timestampSchema,
  context: dynamicMetadataSchema,
  attachment: dynamicMetadataSchema.optional(),
});

export const externalChatEventSchema = z
  .object({
    agentId: z.string().max(255).default(''),
    visitorId: z.string().min(1).max(255),
    timestamp: timestampSchema,
  })
  .extend(messageFieldsSchema.shape);

const envelopeIdentitySchema = z.object({
  version: z.literal(2),
  eventId: z.string().min(1).max(255),
  agentId: z.string().max(255).default(''),
  visitorId: z.string().min(1).max(255),
  timestamp: timestampSchema,
  deliveryMode: deliveryModeSchema.default('live'),
});

const messageEnvelopeSchema = envelopeIdentitySchema
  .extend(messageFieldsSchema.shape)
  .extend({ kind: z.literal('message') });

const messageStateEnvelopeSchema = envelopeIdentitySchema.extend({
  kind: z.enum(['message_state', 'message_deleted']),
  messageId: z.string().min(1).max(255),
  status: z.string().max(80).default('sent'),
  metadata: dynamicMetadataSchema,
});

const observationEnvelopeSchema = envelopeIdentitySchema.extend({
  kind: z.literal('observation'),
  observationId: z.string().min(1).max(255),
  category: z.string().min(1).max(80),
  payload: dynamicMetadataSchema,
});

const ephemeralEnvelopeSchema = envelopeIdentitySchema.extend({
  kind: z.enum(['presence', 'typing']),
  payload: dynamicMetadataSchema,
});

export const externalChatEventEnvelopeSchema = z.discriminatedUnion('kind', [
  messageEnvelopeSchema,
  messageStateEnvelopeSchema,
  observationEnvelopeSchema,
  ephemeralEnvelopeSchema,
]);

export const externalChatBatchSchema = z.object({
  events: z.array(externalChatEventEnvelopeSchema).min(1).max(100),
  cursor: dynamicMetadataObjectSchema.optional(),
  highWaterMark: dynamicMetadataObjectSchema.optional(),
});

export const externalChatSettingsSchema = z.object({
  enabled: z.boolean(),
  bridgeBaseUrl: z
    .string()
    .url()
    .max(2048)
    .refine((value) => {
      try {
        const url = new URL(value);
        return (
          url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          ['/', '/wss'].includes(url.pathname) &&
          !url.search &&
          !url.hash
        );
      } catch {
        return false;
      }
    }, 'Bridge URL must be an HTTPS origin or approved bridge path without credentials, query, or fragment'),
  agentMappings: z.record(z.string(), z.string().uuid()).default({}),
  inboxDefaults: inboxDefaultsSchema,
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
export type ExternalChatEventEnvelope = z.infer<
  typeof externalChatEventEnvelopeSchema
>;
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
  if (!settings || typeof settings !== 'object') return false;
  const parsed = externalChatSettingsSchema.safeParse(
    (settings as Record<string, unknown>).chat
  );
  return (
    parsed.success &&
    parsed.data.enabled &&
    !['fallback_queue', 'paused'].includes(parsed.data.authorityMode)
  );
}

function exceedsDepth(value: unknown, maxDepth: number) {
  const pending: Array<{ depth: number; value: unknown }> = [
    { depth: 0, value },
  ];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current?.value || typeof current.value !== 'object') continue;
    if (current.depth > maxDepth) return true;
    const children = Array.isArray(current.value)
      ? current.value
      : Object.values(current.value as Record<string, unknown>);
    for (const child of children)
      pending.push({ depth: current.depth + 1, value: child });
  }
  return false;
}
