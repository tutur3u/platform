/**
 * The kid map (`SSO_SIGNER_KEYS`, a text binding): each kid is bound to
 * exactly one client and one protocol, with the certificate published for
 * it. The private key is the Worker secret `SSO_SIGNING_KEY_<KID>`. A
 * request whose client or protocol differs from the kid's binding is
 * refused before any key is read.
 */
import { certificateSchema } from '@tuturuuu/sso';
import { z } from 'zod';
import { kidSchema, signingKeySecretName } from './input';

export const MAX_BOUND_KIDS = 8;

const bindingSchema = z
  .object({
    client: z.uuid(),
    protocol: z.enum(['saml', 'oidc']),
    certificate: certificateSchema,
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

export function resolveSigningKey(input: {
  keyMap: KeyMap | null;
  kid: string;
  client: string;
  protocol: string;
  secret: (name: string) => unknown;
}): KeyBindingResult {
  if (!input.keyMap) return { ok: false, error: 'misconfigured' };
  const binding = Object.hasOwn(input.keyMap, input.kid)
    ? input.keyMap[input.kid]
    : undefined;
  if (
    !binding ||
    binding.client !== input.client ||
    binding.protocol !== input.protocol
  ) {
    return { ok: false, error: 'key_binding' };
  }
  const privateKey = input.secret(signingKeySecretName(input.kid));
  if (typeof privateKey !== 'string' || privateKey.trim() === '') {
    return { ok: false, error: 'misconfigured' };
  }
  return { ok: true, certificate: binding.certificate, privateKey };
}
