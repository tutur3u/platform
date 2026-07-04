import { z } from 'zod';

const emailAddressSchema = z.string().trim().toLowerCase().email().max(254);

export const mailDraftPayloadSchema = z.object({
  bodyHtml: z
    .string()
    .max(10 * 1024 * 1024)
    .nullable()
    .optional(),
  bodyText: z
    .string()
    .max(10 * 1024 * 1024)
    .nullable()
    .optional(),
  bcc: z.array(emailAddressSchema).max(100).optional(),
  cc: z.array(emailAddressSchema).max(100).optional(),
  inReplyTo: z.string().max(1024).nullable().optional(),
  references: z.array(z.string().max(1024)).max(50).optional(),
  subject: z.string().trim().max(998).default(''),
  to: z.array(emailAddressSchema).min(1).max(100),
});

export const mailDraftPatchPayloadSchema = mailDraftPayloadSchema.partial();

export const sendMailPayloadSchema = mailDraftPayloadSchema.extend({
  draftId: z.string().uuid().nullable().optional(),
});

export const updateMailStatePayloadSchema = z.object({
  action: z.enum([
    'archive',
    'mark_read',
    'mark_unread',
    'restore',
    'star',
    'trash',
    'unstar',
  ]),
});

export const upsertMailboxMemberPayloadSchema = z.object({
  role: z.enum(['owner', 'admin', 'sender', 'viewer']),
  userId: z.string().uuid(),
});
