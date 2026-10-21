import assert from 'node:assert/strict';

export function assertTerminalRejection(result: {
  error: { status?: number; code?: string } | null;
  data: { user: unknown };
}) {
  assert.equal(result.error?.status, 400);
  assert.equal(result.error?.code, 'validation_failed');
  assert.equal(result.data.user, null);
}
