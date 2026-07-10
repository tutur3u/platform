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

export const mailBulkPayloadSchema = z
  .object({
    action: z.enum([
      'add_label',
      'archive',
      'clear_folder',
      'mark_read',
      'mark_unread',
      'move_to_folder',
      'remove_label',
      'restore',
      'star',
      'trash',
      'unstar',
    ]),
    folderId: z.string().uuid().optional(),
    labelId: z.string().uuid().optional(),
    messageIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .superRefine((value, ctx) => {
    if (
      (value.action === 'add_label' || value.action === 'remove_label') &&
      !value.labelId
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'labelId is required',
        path: ['labelId'],
      });
    }
    if (value.action === 'move_to_folder' && !value.folderId) {
      ctx.addIssue({
        code: 'custom',
        message: 'folderId is required',
        path: ['folderId'],
      });
    }
  });

export const createMailOrganizationSchema = z.object({
  color: z.string().trim().max(64).nullable().optional(),
  name: z.string().trim().min(1).max(80),
});

export const updateMailOrganizationSchema =
  createMailOrganizationSchema.partial();
