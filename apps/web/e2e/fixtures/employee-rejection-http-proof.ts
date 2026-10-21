import assert from 'node:assert/strict';

export const terminalRejectionCredentials = {
  password: 'Aa1!Disposable-Rejection',
  password_hash: 'deliberately-incompatible-with-plaintext',
};

export function assertTerminalRejection(result: {
  error: { status?: number; code?: string } | null;
  data: { user: unknown };
}) {
  assert.equal(result.error?.status, 400);
  assert.equal(result.error?.code, 'validation_failed');
  assert.equal(result.data.user, null);
}
