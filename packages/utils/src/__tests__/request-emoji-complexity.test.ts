import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import {
  findRequestContentViolation,
  getRequestContentViolationForRequest,
} from '../request-emoji-limit';

describe('request content work bounds', () => {
  it('rejects long ancestor keys before visiting their leaves', () => {
    const leaves = Array.from({ length: 100 }, () => 'ok');
    expect(
      findRequestContentViolation({ ['x'.repeat(4096)]: leaves })
    ).toMatchObject({ code: 'REQUEST_COMPLEXITY_EXCEEDED' });
  });
  it('rejects excessive nesting without recursive validation', () => {
    let value: unknown = 'ok';
    for (let i = 0; i < 65; i++) value = { child: value };
    expect(findRequestContentViolation(value)).toMatchObject({
      code: 'REQUEST_COMPLEXITY_EXCEEDED',
    });
  });
  it('rejects excessive leaf counts', () => {
    expect(
      findRequestContentViolation(Array.from({ length: 10001 }, () => 'ok'))
    ).toMatchObject({ code: 'REQUEST_COMPLEXITY_EXCEEDED' });
  });
  it('bounds streamed bytes even without a content length', async () => {
    const request = new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(2 * 1024 * 1024) }),
    });
    await expect(
      getRequestContentViolationForRequest(request)
    ).resolves.toMatchObject({ code: 'REQUEST_COMPLEXITY_EXCEEDED' });
  });
  it('keeps ordinary nested content and field exceptions working', () => {
    expect(
      findRequestContentViolation({ rows: [{ description: 'hello' }] })
    ).toBeNull();
    expect(
      findRequestContentViolation({ snapshot: '🎉'.repeat(20) }, 'body', {
        skipValidationForFields: ['snapshot'],
      })
    ).toBeNull();
  });
});
