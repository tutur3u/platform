import type { Artifact, PlanRef } from './types';

export const MAX_BODY_BYTES = 8_192;

export class InvalidInput extends Error {}

type Json = Record<string, unknown>;

const SHA = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const TOKEN = /^[A-Za-z0-9:._/-]{1,256}$/;
const CODE = /^[A-Z][A-Z0-9_]{0,63}$/;
const ACTOR = /^[A-Za-z0-9:._@-]{1,128}$/;
const LANE = /^[A-Za-z0-9._/-]{1,200}$/;

// Reads the body as a stream and stops at the byte cap, so a missing or false
// Content-Length never makes the Worker buffer an oversized body.
async function readCapped(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new InvalidInput('Body too large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new InvalidInput('Body too large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new InvalidInput('Body is not UTF-8');
  }
}

export async function readJson(request: Request): Promise<Json> {
  const text = await readCapped(request);
  if (!text) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new InvalidInput('Body is not JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InvalidInput('Body must be an object');
  return value as Json;
}

function optional<T>(value: unknown, parse: (value: unknown) => T): T | null {
  return value === undefined || value === null ? null : parse(value);
}

function match(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string' || !pattern.test(value))
    throw new InvalidInput(`Invalid ${field}`);
  return value;
}

export const sha = (value: unknown) => match(value, SHA, 'sha');
export const code = (value: unknown, field = 'reason') =>
  match(value, CODE, field);
export const workerId = (value: unknown) => match(value, TOKEN, 'workerId');
export const actor = (value: unknown) => match(value, ACTOR, 'actor');

export function lane(value: unknown): string {
  const parsed = match(value, LANE, 'lane');
  if (parsed.split('/').some((part) => part === '..' || part === ''))
    throw new InvalidInput('Invalid lane');
  return parsed;
}

export function httpsUrl(value: unknown, field = 'url'): string {
  if (typeof value !== 'string' || value.length > 2_048)
    throw new InvalidInput(`Invalid ${field}`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InvalidInput(`Invalid ${field}`);
  }
  if (url.protocol !== 'https:' || url.username || url.password)
    throw new InvalidInput(`Invalid ${field}`);
  return url.toString();
}

export function plan(value: unknown): PlanRef | null {
  return optional(value, (raw) => {
    const input = object(raw, 'plan');
    const url = optional(input.url, (u) => httpsUrl(u, 'plan.url'));
    if (url && new URL(url).hostname !== 'github.com')
      throw new InvalidInput('plan.url must point at github.com');
    return {
      source: match(input.source, SLUG, 'plan.source'),
      digest: match(input.digest, DIGEST, 'plan.digest'),
      url,
    };
  });
}

export function artifact(value: unknown): Artifact | null {
  return optional(value, (raw) => {
    const input = object(raw, 'artifact');
    return {
      kind: match(input.kind, SLUG, 'artifact.kind'),
      id: match(input.id, TOKEN, 'artifact.id'),
      digest: optional(input.digest, (d) =>
        match(d, DIGEST, 'artifact.digest')
      ),
    };
  });
}

export function grant(value: unknown) {
  const input = object(value, 'grant');
  const epoch = input.epoch;
  if (typeof epoch !== 'number' || !Number.isInteger(epoch) || epoch < 1)
    throw new InvalidInput('Invalid grant.epoch');
  return { attemptId: match(input.attemptId, TOKEN, 'grant.attemptId'), epoch };
}

export function outcome(value: unknown): 'succeeded' | 'failed' {
  if (value !== 'succeeded' && value !== 'failed')
    throw new InvalidInput('Invalid outcome');
  return value;
}

export function reasonText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 200 ||
    [...value].some((char) => {
      const code = char.charCodeAt(0);
      return code < 0x20 || code === 0x7f;
    })
  )
    throw new InvalidInput('Invalid reason');
  return value;
}

export function object(value: unknown, field: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new InvalidInput(`Invalid ${field}`);
  return value as Json;
}

export async function digestOf(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

// Compares secrets through fixed-length digests so timing does not reveal a
// matching prefix.
export async function secretEquals(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all(
    [a, b].map(
      async (value) =>
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
        )
    )
  );
  let difference = 0;
  for (let index = 0; index < left!.length; index += 1)
    difference |= left![index]! ^ right![index]!;
  return difference === 0;
}
