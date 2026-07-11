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
  recipientDisplayNames: z
    .record(emailAddressSchema, z.string().trim().min(1).max(320))
    .optional(),
  subject: z.string().trim().max(998).default(''),
  to: z.array(emailAddressSchema).max(100).default([]),
});

export const mailDraftPatchPayloadSchema = mailDraftPayloadSchema.partial();

export const sendMailPayloadSchema = mailDraftPayloadSchema
  .extend({
    draftId: z.string().uuid().nullable().optional(),
  })
  .refine(
    (value) =>
      value.to.length + (value.cc?.length ?? 0) + (value.bcc?.length ?? 0) > 0,
    { message: 'At least one recipient is required', path: ['to'] }
  );

export const updateMailMailboxSettingsSchema = z.object({
  aiInstructions: z.string().max(20_000).optional(),
  autoDraftEnabled: z.boolean().optional(),
  outboundProviderOverride: z.enum(['cloudflare', 'ses']).nullable().optional(),
  senderName: z.string().trim().max(160).optional(),
  signatureHtml: z.string().max(100_000).nullable().optional(),
  signatureText: z.string().max(50_000).nullable().optional(),
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

export const mailThreadBulkPayloadSchema = z
  .object({
    action: z.enum([
      'add_label',
      'archive',
      'mark_read',
      'mark_unread',
      'remove_label',
      'restore',
      'star',
      'trash',
      'unstar',
    ]),
    labelId: z.string().uuid().optional(),
    threadIds: z.array(z.string().uuid()).min(1).max(100),
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
  });

const mailOrganizationFields = z.object({
  aiAutoApply: z.boolean().optional(),
  aiEnabled: z.boolean().optional(),
  aiInstructions: z.string().trim().max(4000).optional(),
  color: z.string().trim().max(64).nullable().optional(),
  description: z.string().trim().max(500).optional(),
  name: z.string().trim().min(1).max(80),
});

export const createMailOrganizationSchema = mailOrganizationFields.refine(
  (value) => !value.aiAutoApply || value.aiEnabled,
  {
    message: 'AI auto-apply requires AI labeling to be enabled',
    path: ['aiAutoApply'],
  }
);

export const updateMailOrganizationSchema = mailOrganizationFields
  .partial()
  .refine((value) => value.aiEnabled !== false || !value.aiAutoApply, {
    message: 'AI auto-apply requires AI labeling to be enabled',
    path: ['aiAutoApply'],
  });

export const generateMailAiDraftSchema = z.object({
  bodyHtml: z.string().max(200_000).optional(),
  bodyText: z.string().max(100_000).optional(),
  instructions: z.string().trim().min(1).max(4000),
  mode: z.enum(['draft', 'follow_up', 'rewrite']),
  recipients: z.array(emailAddressSchema).max(50).optional(),
  subject: z.string().max(998).optional(),
  threadId: z.string().uuid().optional(),
});

export const suggestMailLabelsSchema = z
  .object({
    action: z.enum(['classify', 'suggest_labels']),
    apply: z.boolean().optional(),
    instructions: z.string().trim().max(4000).optional(),
    threadIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .refine(
    (value) => value.action !== 'classify' || Boolean(value.threadIds?.length),
    {
      message: 'threadIds are required for classification',
      path: ['threadIds'],
    }
  );
