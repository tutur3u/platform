import type { CoordinatorErrorCode } from './types';
import * as v from './validate';

export const STATUS: Record<CoordinatorErrorCode, number> = {
  BUDGET_EXHAUSTED: 429,
  CAPACITY: 429,
  CONFLICT: 409,
  INVALID_STATE: 409,
  LEASE_EXPIRED: 409,
  NOT_FOUND: 404,
  RUN_MISMATCH: 403,
  STALE_GRANT: 409,
  STOPPED: 503,
};

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export const error = (status: number, code: string, message = code) =>
  json({ error: code, message }, status);
export const NOT_FOUND = () => error(404, 'NOT_FOUND', 'Not found');

// Operator calls carry the operator token and the acting user's id. A wrong
// or missing token answers 404 so the route stays indistinguishable from an
// unknown one.
export async function operator(
  request: Request,
  operatorToken: string | undefined
) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!operatorToken || !token) return NOT_FOUND();
  if (!(await v.secretEquals(token, operatorToken))) return NOT_FOUND();
  try {
    return v.actor(request.headers.get('x-deploy-actor'));
  } catch {
    return error(400, 'INVALID_INPUT', 'Missing X-Deploy-Actor');
  }
}
