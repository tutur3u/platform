/**
 * The kid map (`SSO_SIGNER_KEYS`, a text binding): each kid is bound to
 * exactly one client and one protocol, with the certificate published for
 * it, the service provider's entity ID and the origins its ACS URLs may
 * use. The private key is the Worker secret `SSO_SIGNING_KEY_<KID>`. A
 * request whose client, protocol, SP entity ID or ACS origin differs from
 * the kid's binding is refused before any key is read, so even a caller
 * holding a valid permit cannot aim the kid at another service provider.
 */
import { certificateSchema, entityIdSchema } from '@tuturuuu/sso';
import { z } from 'zod';
import { kidSchema, signingKeySecretName } from './input';

export const MAX_BOUND_KIDS = 8;
export const MAX_ACS_ORIGINS = 4;

/** An `https:` origin exactly as `URL#origin` prints it. */
const originSchema = z
  .string()
  .max(512)
  .refine((text) => {
    try {
      const url = new URL(text);
      return url.protocol === 'https:' && url.origin === text;
    } catch {
      return false;
    }
  });

const bindingSchema = z
  .object({
    client: z.uuid(),
    protocol: z.enum(['saml', 'oidc']),
    certificate: certificateSchema,
    entityId: entityIdSchema,
    acsOrigins: z.array(originSchema).min(1).max(MAX_ACS_ORIGINS),
  })
  .strict();
const keyMapSchema = z
  .record(kidSchema, bindingSchema)
  .refine((map) => Object.keys(map).length <= MAX_BOUND_KIDS);
export type KeyMap = z.infer<typeof keyMapSchema>;

export type KeyBindingResult =
  | Readonly<{ ok: true; certificate: string; privateKey: string }>
  | Readonly<{ ok: false; error: 'misconfigured' | 'key_binding' }>;

/** Parses the kid map, or null when it is empty or malformed. */
export function parseKeyMap(raw: unknown): KeyMap | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = keyMapSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function resolveSigningKey(input: {
  keyMap: KeyMap | null;
  kid: string;
  client: string;
  protocol: string;
  entityId: string;
  acsUrl: string;
  secret: (name: string) => unknown;
}): KeyBindingResult {
  if (!input.keyMap) return { ok: false, error: 'misconfigured' };
  const binding = Object.hasOwn(input.keyMap, input.kid)
    ? input.keyMap[input.kid]
    : undefined;
  const acsOrigin = originOf(input.acsUrl);
  if (
    !binding ||
    binding.client !== input.client ||
    binding.protocol !== input.protocol ||
    binding.entityId !== input.entityId ||
    !acsOrigin ||
    !binding.acsOrigins.includes(acsOrigin)
  ) {
    return { ok: false, error: 'key_binding' };
  }
  const privateKey = input.secret(signingKeySecretName(input.kid));
  if (typeof privateKey !== 'string' || privateKey.trim() === '') {
    return { ok: false, error: 'misconfigured' };
  }
  return { ok: true, certificate: binding.certificate, privateKey };
}
