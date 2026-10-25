import { describe, expect, it } from 'vitest';
import { PASSWORDS_LIMITS } from './port';
import { putItemInput, sanitizedValidator, setMemberInput } from './schemas';

const ids = {
  vaultId: '11111111-1111-4111-8111-111111111111',
  requestId: '22222222-2222-4222-8222-222222222222',
};

describe('putItemInput', () => {
  const valid = {
    wsId: 'personal',
    ...ids,
    name: 'prod.env',
    base64: 'aGk=',
    revision: 0,
  };

  it('accepts a labelled base64 file and trims the label', () => {
    expect(putItemInput.parse({ ...valid, name: '  prod.env ' }).name).toBe(
      'prod.env'
    );
  });

  it('rejects malformed base64, empty labels and oversized payloads', () => {
    expect(
      putItemInput.safeParse({ ...valid, base64: 'not base64!' }).success
    ).toBe(false);
    expect(putItemInput.safeParse({ ...valid, name: '   ' }).success).toBe(
      false
    );
    const oversized = 'QUJD'.repeat(
      Math.ceil(PASSWORDS_LIMITS.itemMaxBytes / 3) + 1
    );
    expect(
      putItemInput.safeParse({ ...valid, base64: oversized }).success
    ).toBe(false);
  });

  it('requires a request id so retries keep one operation identity', () => {
    const { requestId: _omitted, ...rest } = valid;
    expect(putItemInput.safeParse(rest).success).toBe(false);
  });
});

describe('setMemberInput', () => {
  it('only accepts the three vault roles', () => {
    const base = {
      wsId: 'w',
      ...ids,
      userId: '33333333-3333-4333-8333-333333333333',
      revoked: false,
      revision: 3,
    };
    expect(setMemberInput.safeParse({ ...base, role: 'editor' }).success).toBe(
      true
    );
    expect(setMemberInput.safeParse({ ...base, role: 'admin' }).success).toBe(
      false
    );
  });
});

it('never exposes rejected input in validator errors', () => {
  const sensitive = 'synthetic-private-value';
  try {
    sanitizedValidator(putItemInput)({ base64: sensitive });
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('INVALID_INPUT');
    expect(JSON.stringify(error)).not.toContain(sensitive);
  }
});
