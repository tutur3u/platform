import {
  PLAYGROUND_LANGUAGES,
  type PlaygroundLanguage,
} from '@tuturuuu/types/primitives/playgrounds';
import { playgroundTemplates } from '@tuturuuu/utils/playground-templates';
import { z } from 'zod';
import { bytes } from './protocol';

// Staging-only acceptance source. Where qualification is enabled, a Run whose
// source ticket carries this prefix gets a stock template instead of fetching
// saved source from Web, so the ingress, admission, slot, guest, result and
// stop path can be exercised for several requesters without a Web project.
// Tickets are signed with the ingress secret and expire, and only stock
// templates are ever served.
export const FIXTURE_TICKET_PREFIX = 'playground-fixture.v1.';
const MAX_TICKET_AGE_MS = 15 * 60_000;

const FixtureClaims = z.strictObject({
  projectId: z.uuid(),
  revision: z.number().int().nonnegative(),
  language: z.enum(PLAYGROUND_LANGUAGES),
  expiresAt: z.number().int().positive(),
});
export type FixtureClaims = z.infer<typeof FixtureClaims>;

function base64url(data: Uint8Array) {
  return btoa(String.fromCharCode(...data))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

function fromBase64url(text: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(text)) throw new Error('Invalid encoding');
  const padded = text.replaceAll('-', '+').replaceAll('_', '/');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function hmac(key: BufferSource, message: string) {
  const imported = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(
    await crypto.subtle.sign('HMAC', imported, bytes(message))
  );
}

async function signature(secret: string, payload: string) {
  // A key derived for fixture tickets only, apart from the ingress bearer and
  // the sealed-input key.
  const derived = await hmac(bytes(secret), FIXTURE_TICKET_PREFIX);
  const key = await crypto.subtle.importKey(
    'raw',
    derived,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      bytes(FIXTURE_TICKET_PREFIX + payload)
    )
  );
}

export async function fixtureTicket(secret: string, claims: FixtureClaims) {
  const payload = base64url(bytes(JSON.stringify(FixtureClaims.parse(claims))));
  return `${FIXTURE_TICKET_PREFIX}${payload}.${base64url(await signature(secret, payload))}`;
}

export function isFixtureTicket(ticket: string) {
  return ticket.startsWith(FIXTURE_TICKET_PREFIX);
}

/** The stock template a valid, unexpired fixture ticket names, else an error. */
export async function fixtureJob(
  secret: string,
  ticket: string,
  expected: { projectId: string; revision: number },
  now = Date.now()
) {
  if (!secret || secret.length < 32 || !isFixtureTicket(ticket))
    throw new Error('Invalid fixture ticket');
  const [payload, mac, extra] = ticket
    .slice(FIXTURE_TICKET_PREFIX.length)
    .split('.');
  if (!payload || !mac || extra !== undefined)
    throw new Error('Invalid fixture ticket');
  const presented = fromBase64url(mac);
  const computed = await signature(secret, payload);
  let difference = presented.length ^ computed.length;
  for (let index = 0; index < computed.length; index += 1)
    difference |= (presented[index] ?? 0) ^ (computed[index] ?? 0);
  if (difference !== 0) throw new Error('Invalid fixture ticket');
  const claims = FixtureClaims.parse(
    JSON.parse(new TextDecoder().decode(fromBase64url(payload)))
  );
  if (
    claims.expiresAt <= now ||
    claims.expiresAt > now + MAX_TICKET_AGE_MS ||
    claims.projectId !== expected.projectId ||
    claims.revision !== expected.revision
  )
    throw new Error('Invalid fixture ticket');
  const template = playgroundTemplates[claims.language as PlaygroundLanguage];
  return {
    command: template.command,
    files: [{ path: template.path, content: template.content }],
  };
}
