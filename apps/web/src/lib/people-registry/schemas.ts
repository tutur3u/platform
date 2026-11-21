import { z } from 'zod';

// Request bodies for the people registry manager routes. Values mirror the
// enumerations enforced by the registry definer functions.

const uuid = z.string().uuid();
const revision = z.number().int().positive().nullable();

export const channelSchema = z.enum([
  'zalo',
  'whatsapp',
  'discord',
  'email',
  'phone',
]);
export const boundChannelSchema = z.enum(['zalo', 'whatsapp', 'discord']);
const providerAccount = z.string().regex(/^[!-~]{1,200}$/);

export const createPersonSchema = z.strictObject({
  kind: z.enum(['person', 'organisation']).default('person'),
  label: z.string().trim().min(1).max(200),
  isOwner: z.boolean().default(false),
});

export const updatePersonSchema = z.strictObject({
  baseVersion: z.number().int().positive(),
  label: z.string().trim().min(1).max(200).optional(),
  kind: z.enum(['person', 'organisation']).optional(),
});

export const deletePersonSchema = z.strictObject({
  step: z.enum(['begin', 'finish']),
  withoutSuppression: z.boolean().default(false),
});

export const factSchema = z
  .strictObject({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
    value: z.string().trim().min(1).max(2000).optional(),
    baseRevision: revision,
    audience: z.enum(['origin', 'subject_conversations', 'listed']).optional(),
    audienceConversationIds: z.array(uuid).max(50).optional(),
    ownerDm: z.boolean().optional(),
    remove: z.boolean().default(false),
  })
  .refine((body) => body.remove || body.value !== undefined, {
    path: ['value'],
  });

export const ruleSchema = z.strictObject({
  scope: z.enum(['channel_default', 'conversation', 'person']),
  channel: channelSchema.optional(),
  conversationId: uuid.optional(),
  rule: z.enum([
    'addressed_response',
    'group_response',
    'reply_mode',
    'owner_instructions',
    'mention_sender',
    'quiet_hours',
    'quiet_hours_bypass',
    'hold_topics',
    'hold_action',
    'initiate',
    'escalate',
  ]),
  value: z.unknown().optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  baseRevision: revision,
  remove: z.boolean().default(false),
});

export const consentSchema = z.strictObject({
  store: z.enum(['profile', 'memory', 'capture']),
  state: z.enum(['granted', 'unknown', 'denied', 'revoked', 'expired']),
  basis: z.enum(['subject_given', 'owner_attested']).optional(),
  evidence: z
    .strictObject({
      messageRef: z.string().max(200).optional(),
      note: z.string().max(1000).optional(),
    })
    .default({}),
  scope: z
    .strictObject({
      purposes: z
        .array(z.enum(['reply', 'brief', 'fleet']))
        .max(3)
        .optional(),
    })
    .default({}),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

export const relationshipSchema = z.strictObject({
  otherPersonId: uuid,
  direction: z.enum(['out', 'in']).default('out'),
  kind: z.enum([
    'owner',
    'family',
    'partner',
    'friend',
    'colleague',
    'manager',
    'report',
    'client',
    'vendor',
    'member_of',
    'other',
  ]),
  label: z.string().trim().max(80).optional(),
  confidence: z.number().min(0).max(1).default(1),
  remove: z.boolean().default(false),
});

export const addIdentitySchema = z.strictObject({
  channel: channelSchema,
  account: providerAccount,
  externalId: z.string().trim().min(1).max(320),
  displayValue: z.string().trim().min(1).max(200).optional(),
  basis: z.enum([
    'owner_statement',
    'self_introduction',
    'same_phone',
    'same_name',
    'migration',
  ]),
});

export const decideIdentitySchema = z.strictObject({
  identityId: uuid,
  state: z.enum(['confirmed', 'rejected']),
});

export const managerSchema = z.strictObject({
  userId: uuid,
  expiresAt: z.string().datetime({ offset: true }).nullable().default(null),
  remove: z.boolean().default(false),
});

export const bindingSchema = z.strictObject({
  channel: boundChannelSchema,
  account: providerAccount,
  remove: z.boolean().default(false),
});

export const flagsSchema = z.strictObject({
  captureEnabled: z.boolean().optional(),
  personalSessionsEnabled: z.boolean().optional(),
  stopped: z.boolean().optional(),
});

export const listQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  after: uuid.optional(),
});
