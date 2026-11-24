import {
  certificateSchema,
  idpConfigSchema,
  SsoError,
  spProfileSchema,
} from '@tuturuuu/sso';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import type { SsoConfiguration } from './config';

const snapshotSchema = z.object({
  client: z.object({
    id: z.uuid(),
    ws_id: z.uuid(),
    display_name: z.string().min(1).max(160),
    enabled: z.literal(true),
    policy_revision: z.number().int().positive(),
    approved_email_domains: z.array(z.string()).min(1),
  }),
  saml: z.object({
    entity_id: z.string(),
    acs_urls: z.array(z.string()).length(1),
    name_id_format: spProfileSchema.unwrap().shape.nameIdFormat,
    request_signing_mode: z
      .enum(['unsigned', 'required'])
      .nullable()
      .optional(),
    sp_certificate: z.string().nullable().optional(),
  }),
  key: z.object({
    id: z.uuid(),
    kid: z.string(),
    revision: z.number().int().positive(),
    public_certificate: certificateSchema,
    status: z.literal('active'),
  }),
  member: z.boolean(),
  assigned: z.boolean(),
});
export function boundedFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) {
  const timeout = AbortSignal.timeout(4000);
  return fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
  });
}
export const adminClient = () =>
  createAdminClient({ noCookie: true, fetch: boundedFetch });
export type SsoAdmin = Awaited<ReturnType<typeof adminClient>>;
export async function snapshot(
  admin: SsoAdmin,
  config: SsoConfiguration,
  actorId?: string
) {
  const result = await admin.rpc('sso_issuance_snapshot', {
    p_client_id: config.clientId,
    ...(actorId ? { p_actor_id: actorId } : {}),
  });
  if (result.error) throw new SsoError({ code: 'unavailable' });
  if (!result.data) throw new SsoError({ code: 'forbidden' });
  const row = snapshotSchema.parse(result.data);
  if (row.client.id !== config.clientId || row.key.kid !== config.signingKid)
    throw new SsoError({ code: 'forbidden' });
  const base = `${config.origin}api/v1/sso/saml/${config.clientId}`;
  return {
    name: row.client.display_name,
    policy: {
      clientId: row.client.id,
      workspaceId: row.client.ws_id,
      revision: row.client.policy_revision,
      domains: row.client.approved_email_domains,
      member: row.member,
      assigned: row.assigned,
      keyId: row.key.id,
      keyRevision: row.key.revision,
    },
    profile: spProfileSchema.parse({
      entityId: row.saml.entity_id,
      acsUrl: row.saml.acs_urls[0],
      nameIdFormat: row.saml.name_id_format,
      requestSigning:
        row.saml.request_signing_mode === 'required'
          ? { mode: 'required', certificate: row.saml.sp_certificate }
          : row.saml.request_signing_mode === 'unsigned'
            ? { mode: 'unsigned' }
            : config.requestSigning,
    }),
    idp: idpConfigSchema.parse({
      entityId: `${base}/metadata`,
      ssoUrl: `${base}/sso`,
      signingCertificate: row.key.public_certificate,
    }),
  };
}
const metadataCertificatesSchema = z
  .array(
    z.object({
      kid: z.string(),
      status: z.enum(['active', 'pending', 'retiring']),
      revision: z.number().int().positive(),
      public_certificate: certificateSchema,
    })
  )
  // At most two rollover keys: more fails closed rather than publishing a
  // truncated set.
  .min(1)
  .max(3);
/**
 * Rollover certificates published beside the active signing certificate.
 * The projection must lead with the same active key the snapshot signs with;
 * anything else fails closed.
 */
export async function rolloverCertificates(
  admin: SsoAdmin,
  config: SsoConfiguration,
  active: { certificate: string; revision: number }
) {
  const result = await admin.rpc('sso_metadata_certificates', {
    p_client_id: config.clientId,
  });
  if (result.error) throw new SsoError({ code: 'unavailable' });
  const parsed = metadataCertificatesSchema.safeParse(result.data);
  if (!parsed.success) throw new SsoError({ code: 'unavailable' });
  const [first, ...rest] = parsed.data;
  if (
    first?.status !== 'active' ||
    first.kid !== config.signingKid ||
    first.revision !== active.revision ||
    first.public_certificate !== active.certificate ||
    rest.some((key) => key.status === 'active')
  )
    throw new SsoError({ code: 'forbidden' });
  return rest.map((key) => key.public_certificate);
}
export function requireRpc(result: { error: unknown }) {
  if (result.error) throw new SsoError({ code: 'unavailable' });
}
