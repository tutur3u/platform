import { randomBytes } from 'node:crypto';
import { SsoError, validatedRequestSchema } from '@tuturuuu/sso';
import { EncryptJWT, jwtDecrypt } from 'jose';
import { z } from 'zod';
import { hash, type SsoConfiguration } from './config';

export const handleSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const opaque = () => randomBytes(32).toString('base64url');
const policySchema = z.object({
  clientId: z.uuid(),
  workspaceId: z.uuid(),
  revision: z.number().int().positive(),
  domains: z.array(z.string()),
  member: z.boolean(),
  assigned: z.boolean(),
  keyId: z.uuid(),
  keyRevision: z.number().int().positive(),
});
export const stateSchema = z.object({
  id: z.uuid(),
  handle: handleSchema,
  browserHash: z.string().regex(/^[0-9a-f]{64}$/),
  csrf: handleSchema,
  expiresAt: z.iso.datetime(),
  request: validatedRequestSchema,
  policy: policySchema,
});
export type BrowserState = z.infer<typeof stateSchema>;
export const cookieName = (handle: string) =>
  `__Host-sso-${handleSchema.parse(handle)}`;
const key = (config: SsoConfiguration) =>
  Buffer.from(hash(config.transactionSecret), 'hex');
export async function seal(state: BrowserState, config: SsoConfiguration) {
  const value = await new EncryptJWT(state)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuer(config.origin)
    .setAudience('sso-browser')
    .setExpirationTime(Math.floor(Date.parse(state.expiresAt) / 1000))
    .encrypt(key(config));
  if (value.length > 3800) throw new SsoError({ code: 'unavailable' });
  return value;
}
export async function unseal(
  value: string | undefined,
  handle: string,
  config: SsoConfiguration
) {
  if (!value || value.length > 3800) throw new SsoError({ code: 'forbidden' });
  const { payload } = await jwtDecrypt(value, key(config), {
    issuer: config.origin,
    audience: 'sso-browser',
    keyManagementAlgorithms: ['dir'],
    contentEncryptionAlgorithms: ['A256GCM'],
  });
  const state = stateSchema.parse(payload);
  if (
    state.handle !== handle ||
    state.policy.clientId !== config.clientId ||
    Date.parse(state.expiresAt) <= Date.now()
  ) {
    throw new SsoError({ code: 'expired' });
  }
  return state;
}
export function csrfFor(
  state: BrowserState,
  actor: { userId: string; sessionId: string }
) {
  return hash(`${state.csrf}:${actor.userId}:${actor.sessionId}`);
}
