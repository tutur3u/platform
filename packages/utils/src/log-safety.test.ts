import { describe, expect, it } from 'vitest';
import {
  SAFE_ERROR_MESSAGE_LIMIT,
  safeErrorFields,
  scrubLogMessage,
} from './log-safety';

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

describe('safeErrorFields with a scrubbed message', () => {
  const fields = (error: unknown) => safeErrorFields(error, { message: true });

  it('adds the message only when asked, and never the stack or cause', () => {
    const error = new TypeError('Cannot read properties of undefined', {
      cause: new Error('private cause'),
    });
    expect(safeErrorFields(error)).toEqual({ name: 'TypeError' });
    const logged = fields(error);
    expect(logged).toEqual({
      name: 'TypeError',
      message: 'Cannot read properties of undefined',
    });
    expect(JSON.stringify(logged)).not.toMatch(/at |private cause|stack/u);
  });

  it('truncates the message to 200 characters on one line', () => {
    const logged = fields(new Error(`first line\n${'word '.repeat(200)}`));
    expect(logged.message?.length).toBe(SAFE_ERROR_MESSAGE_LIMIT);
    expect(logged.message?.endsWith('…')).toBe(true);
    expect(logged.message).not.toMatch(/\n/u);
  });

  it.each([
    [
      'a JWT',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U rejected',
      'eyJhbGci',
    ],
    ['a Supabase key', 'invalid key sb_secret_AbCdEf123456_xyz', 'sb_secret_'],
    [
      'a publishable key',
      'key sb_publishable_q1w2e3r4t5y6 rejected',
      'sb_publishable_',
    ],
    ['a bearer token', 'Authorization: Bearer abc.def-ghi_123', 'abc.def'],
    ['a basic credential', 'header Basic dXNlcjpwYXNz failed', 'dXNlcjpwYXNz'],
    [
      'a URL with credentials',
      'fetch https://user:hunter2@db.example.com/x failed',
      'hunter2',
    ],
    [
      'a URL with a query string',
      'GET https://api.example.com/v1/items?access_token=s3cr3t failed',
      's3cr3t',
    ],
    ['an email address', 'no user jane.doe+x@example.co.uk', 'jane.doe'],
    [
      'a long hex string',
      `digest ${'0123456789abcdef'.repeat(4)} mismatch`,
      '0123456789abcdef0123',
    ],
    [
      'a long base64 string',
      `blob ${'QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo'.repeat(2)}= bad`,
      'QUJDREVGR0hJSktM',
    ],
    ['a password assignment', 'connect failed password=hunter2;', 'hunter2'],
  ])('redacts %s', (_shape, message, secret) => {
    const logged = fields(new Error(message));
    expect(logged.message).toBeTypeOf('string');
    expect(logged.message).not.toContain(secret);
    expect(logged.message).toMatch(/\[redacted/u);
  });

  it('scrubs a thrown string and ignores other non-Error throws', () => {
    expect(fields('failed for jane@example.com')).toEqual({
      message: 'failed for [redacted-email]',
    });
    expect(fields(42)).toEqual({});
    expect(fields(undefined)).toEqual({});
    expect(fields(Symbol('private'))).toEqual({});
  });

  it('never runs a hostile toString, valueOf or message getter', () => {
    const calls: string[] = [];
    const hostile = {
      toString() {
        calls.push('toString');
        return 'private';
      },
      valueOf() {
        calls.push('valueOf');
        return 'private';
      },
      get message() {
        calls.push('message');
        return 'private';
      },
    };
    expect(fields(hostile)).toEqual({});
    expect(calls).toEqual([]);
    const loop: object = new Proxy(
      {},
      { getPrototypeOf: () => loop, getOwnPropertyDescriptor: () => undefined }
    );
    expect(fields(loop)).toEqual({});
    const throwing = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error('trap');
        },
      }
    );
    expect(fields(throwing)).toEqual({});
  });

  it('scrubs before it truncates, so a secret at the cut never leaks', () => {
    const message = `${'x '.repeat(95)}eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlLXNpZ25hdHVyZQ`;
    expect(scrubLogMessage(message)).not.toContain('eyJzdWIi');
  });
});
