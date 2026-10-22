import type { SsoClientDetail, SsoOverview } from '@tuturuuu/internal-api/sso';
import { certificateSchema, spProfileSchema } from '@tuturuuu/sso';
import { z } from 'zod';

const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const clientInput = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    domains: z
      .array(
        z
          .string()
          .max(253)
          .regex(/^[a-z0-9]+([.-][a-z0-9]+)*\.[a-z]+$/)
      )
      .min(1)
      .max(32),
    ...spProfileSchema.unwrap().shape,
  })
  .strict();
export const clientCreate = clientInput.transform((input) => ({
  ...input,
  expectedRevision: 0,
  enabled: false,
  confirmEnable: false,
}));
export const clientUpdate = clientInput.extend({
  expectedRevision: revision.positive(),
  enabled: z.boolean(),
  confirmEnable: z.boolean().optional(),
});
export const activationInput = z
  .object({
    expectedRevision: revision.positive(),
    enabled: z.boolean(),
    confirmEnable: z.boolean().optional(),
  })
  .strict();
export const assignmentInput = z
  .object({ userId: z.uuid(), expectedRevision: revision, active: z.boolean() })
  .strict();
export const overviewSchema = z.object({
  clients: z.array(
    z.object({
      id: z.uuid(),
      displayName: z.string(),
      enabled: z.boolean(),
      revision: revision.positive(),
      domains: z.array(z.string()),
      entityId: z.string(),
      acsUrl: z.string(),
      nameIdFormat: spProfileSchema.unwrap().shape.nameIdFormat,
      requestSigningMode: z.enum(['unsigned', 'required']).nullable(),
      spCertificate: z.string().nullable(),
    })
  ),
}) satisfies z.ZodType<Omit<SsoOverview, 'globalEnabled'>>;
export const detailSchema = z.object({
  members: z.array(
    z.object({
      userId: z.uuid(),
      displayName: z.string().nullable(),
      active: z.boolean(),
      revision,
    })
  ),
  keys: z.array(
    z.object({
      kid: z.string(),
      status: z.enum(['pending', 'active', 'retiring', 'revoked']),
      publicCertificate: certificateSchema,
      notBefore: z.string(),
      notAfter: z.string(),
      createdAt: z.string(),
      activatedAt: z.string().nullable(),
      retiredAt: z.string().nullable(),
      revokedAt: z.string().nullable(),
    })
  ),
  audit: z.array(
    z.object({
      id: z.uuid(),
      eventType: z.string(),
      revision,
      createdAt: z.string(),
    })
  ),
}) satisfies z.ZodType<Omit<SsoClientDetail, 'setup' | 'pilotSelected'>>;
