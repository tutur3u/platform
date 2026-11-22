import { describe, expect, it } from 'vitest';
import { safeErrorFields } from './log-safety';

describe('safeErrorFields', () => {
  it('omits raw PostgREST and provider fields', () => {
    const privateValue = 'private@example.test';
    expect(
      safeErrorFields({
        name: 'PostgrestError',
        code: '22P02',
        status: 400,
        message: privateValue,
        details: privateValue,
        hint: privateValue,
        body: { recipient: privateValue },
        response: { body: privateValue, status: 422 },
      })
    ).toEqual({ name: 'PostgrestError', code: '22P02', status: 400 });
    expect(
      safeErrorFields(
        new TypeError(privateValue, {
          cause: { message: privateValue },
        })
      )
    ).toEqual({ name: 'TypeError' });
    expect(safeErrorFields(privateValue)).toEqual({});
  });

  it.each(['PGRST116', '23505', 'MAIL_READ_TIMEOUT'])(
    'keeps the allowed code %s',
    (code) => {
      expect(safeErrorFields({ code })).toEqual({ code });
    }
  );

  it.each([
    ['a person and phone number', 'Jane_Doe', '15551234567'],
    ['huge strings', 'E'.repeat(100_000), 'A'.repeat(100_000)],
    ['symbols', Symbol('private'), Symbol('private')],
    ['arbitrary tokens', 'Error\n', 'UNRECOGNIZED_CODE'],
    ['non-strings', { name: 'Error' }, 429],
    ['control characters', 'Error', '23505\n'],
  ] as const)(
    'replaces unknown names and codes from %s',
    (_label, name, code) => {
      expect(safeErrorFields({ name, code })).toEqual({
        name: name === 'Error' ? 'Error' : 'other',
        code: 'other',
      });
    }
  );

  it.each([100, 599])(
    'keeps HTTP status %s and prefers it over statusCode',
    (status) => {
      expect(safeErrorFields({ status, statusCode: 503 })).toEqual({ status });
    }
  );

  it.each([99, 600, 200.1, Infinity, NaN, '400', Symbol('private')])(
    'ignores a status outside the integer HTTP range (%s)',
    (status) => {
      expect(safeErrorFields({ status })).toEqual({});
      expect(safeErrorFields({ status, statusCode: 503 })).toEqual({
        status: 503,
      });
    }
  );

  it('handles throwing accessors and preserves readable fields', () => {
    expect(
      safeErrorFields({
        get name() {
          throw new Error('private@example.test');
        },
        code: 'PGRST116',
        get status() {
          throw new Error('private@example.test');
        },
        statusCode: 406,
      })
    ).toEqual({ name: 'other', code: 'PGRST116', status: 406 });
  });

  it('returns safe fields even when a proxy throws for any property access', () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();
    expect(safeErrorFields(proxy)).toEqual({ name: 'other', code: 'other' });
    expect(safeErrorFields(Symbol('private'))).toEqual({});
  });
});
