import { expect } from 'vitest';
import { email, id, op } from './employee-restoration-test-fixture';

export const body = { confirmationEmail: email, expectedRevision: 0 };
export const context = (userId = id) => ({
  params: Promise.resolve({ userId }),
});
export function request(
  value: unknown = body,
  headers?: HeadersInit,
  method = 'POST'
) {
  return new Request('https://infrastructure.example.test/employees/restore', {
    method,
    headers: headers ?? {
      'content-type': 'application/json',
      'x-tuturuuu-account-action': '1',
    },
    ...(method === 'GET' || method === 'HEAD'
      ? {}
      : { body: JSON.stringify(value) }),
  });
}
export async function response(
  response: Response,
  status: number,
  recovery = false
) {
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe(
    'private, no-store, max-age=0'
  );
  expect([...response.headers.keys()].sort()).toEqual([
    'cache-control',
    'content-type',
  ]);
  const text = await response.text();
  expect(text).not.toMatch(
    /synthetic private|private diagnostic|password|details|authorization|cookie/i
  );
  if (!recovery) expect(text).not.toMatch(/recovery/i);
  return JSON.parse(text);
}
export const pending = (uncertain = true, operationId = op) => ({
  status: 'pending',
  operationId,
  nextAction: 'inspect',
  code: uncertain
    ? 'employee_restore_outcome_unknown'
    : 'employee_restore_confirmation_pending',
  message:
    'Employee restoration is pending. Inspect this operation before taking another action.',
});
