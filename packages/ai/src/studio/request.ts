import { randomUUID } from 'node:crypto';

export function getAiStudioRequestId(request: Request): string {
  return request.headers.get('x-request-id')?.slice(0, 128) || randomUUID();
}

export function getIdempotencyKey(request: Request): string | null {
  return request.headers.get('idempotency-key')?.slice(0, 255) || null;
}

export function getRequestDurationMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
