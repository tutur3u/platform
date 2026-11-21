import { createHash, randomBytes } from 'node:crypto';
import { readBoundedResponseBytes } from '@tuturuuu/utils/read-bounded-response';
import { z } from 'zod';
import { fleetJson } from './session';

const maxBodyBytes = 4096;
const tooLarge = 'fleet_request_too_large';

export const fleetCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export function createFleetCode() {
  return randomBytes(32).toString('base64url');
}

export function fleetCodeHash(code: string) {
  return `\\x${createHash('sha256').update(code).digest('hex')}`;
}

export async function parseFleetRequest<T>(
  request: Request,
  schema: z.ZodType<T>
) {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/json'
  ) {
    return { error: fleetJson({ error: 'unsupported_media_type' }, 415) };
  }
  try {
    const bytes = await readBoundedResponseBytes({
      response: request,
      maxBytes: maxBodyBytes,
      tooLargeMessage: tooLarge,
    });
    const input: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    );
    const result = schema.safeParse(input);
    if (result.success) return { data: result.data, bytes };
  } catch (error) {
    if (error instanceof Error && error.message === tooLarge) {
      return { error: fleetJson({ error: 'payload_too_large' }, 413) };
    }
  }
  return { error: fleetJson({ error: 'invalid_request' }, 400) };
}

export function fleetUnavailable() {
  console.error('Fleet intent or identity operation unavailable');
  return fleetJson({ error: 'fleet_unavailable' }, 503);
}
