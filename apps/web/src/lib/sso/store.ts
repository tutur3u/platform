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
      requestSigning: config.requestSigning,
    }),
    idp: idpConfigSchema.parse({
      entityId: `${base}/metadata`,
      ssoUrl: `${base}/sso`,
      signingCertificate: row.key.public_certificate,
    }),
  };
}
export function requireRpc(result: { error: unknown }) {
  if (result.error) throw new SsoError({ code: 'unavailable' });
}
