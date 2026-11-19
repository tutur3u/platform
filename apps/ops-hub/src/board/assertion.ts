import { bytesFromBase64, readBounded } from '../protocol';
import { identity, uuid, type Identity } from './contracts';
import { reject } from './store';

const header = 'x-board-assertion';
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export const maxBody = 16 * 1024;
export function encode(value: string) {
  return encoder.encode(value);
}
export async function hash(value: Uint8Array<ArrayBuffer>) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', value)),
    (byte) => byte.toString(16).padStart(2, '0')
  ).join('');
}

export function decodeBoardPayload(value: string, max: number) {
  if (value.length > max || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

export async function authorize(
  request: Pick<Request, 'headers' | 'method' | 'url' | 'body'>,
  env: Env
) {
  const assertion = request.headers.get(header);
  if (!assertion || assertion.length > 2048) reject(401, 'unauthenticated');
  const [payload, signature, extra] = assertion.split('.');
  if (!payload || !signature || extra !== undefined)
    reject(401, 'unauthenticated');
  let actor: Identity;
  try {
    actor = identity.parse(
      JSON.parse(decoder.decode(decodeBoardPayload(payload, 1900)))
    );
  } catch {
    reject(401, 'unauthenticated');
  }
  const now = Date.now();
  if (
    !env.BOARD_ASSERTION_AUDIENCE ||
    actor.aud !== env.BOARD_ASSERTION_AUDIENCE ||
    actor.issuedAt > now + 5_000 ||
    actor.expiresAt <= now ||
    actor.expiresAt > actor.issuedAt + 60_000
  )
    reject(401, 'unauthenticated');
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await readBounded(request.body, maxBody);
  } catch {
    reject(413, 'payload_too_large');
  }
  const url = new URL(request.url);
  const target = url.pathname + url.search;
  const idempotency = request.headers.get('Idempotency-Key') ?? '';
  const digest = await hash(body);
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      bytesFromBase64(
        actor.kid === 'a' ? env.BOARD_PUBLIC_KEY_A : env.BOARD_PUBLIC_KEY_B
      ),
      'Ed25519',
      false,
      ['verify']
    );
    if (
      !(await crypto.subtle.verify(
        'Ed25519',
        key,
        bytesFromBase64(signature),
        encode(
          JSON.stringify([
            'tuturuuu-board-v2',
            payload,
            request.method,
            target,
            digest,
            idempotency,
          ])
        )
      ))
    ) {
      reject(401, 'unauthenticated');
    }
  } catch {
    reject(401, 'unauthenticated');
  }
  if (request.method !== 'GET' && !uuid.safeParse(idempotency).success)
    reject(400, 'invalid_request');
  let json: unknown = {};
  if (body.length) {
    if (
      !/^application\/json(?:;|$)/i.test(
        request.headers.get('content-type') ?? ''
      )
    )
      reject(415, 'unsupported_media_type');
    try {
      json = JSON.parse(decoder.decode(body));
    } catch {
      reject(400, 'invalid_request');
    }
  }
  return {
    actor,
    json,
    idempotency,
    fingerprint: await hash(
      encode(JSON.stringify([request.method, target, digest]))
    ),
    url,
  };
}

export function boardPath(pathname: string) {
  try {
    return pathname
      .split('/')
      .slice(2)
      .map((part) => decodeURIComponent(part));
  } catch {
    reject(400, 'invalid_request');
  }
}
