import { afterEach, describe, expect, it, vi } from 'vitest';
import { TuturuuuUserClient } from '../platform';
import {
  feedbackTerminalText,
  runFeedbackCommand,
  validateFeedbackCommand,
} from './feedback';

const id = '12345678-1234-4234-8234-123456789abc';
const row = {
  id,
  title: 'Synthetic title',
  createdAt: '2026-10-08T00:00:00Z',
  status: 'open',
  archivedAt: null,
  revision: 0,
};
const boundCursor = Buffer.from(
  JSON.stringify({
    v: 1,
    view: 'archive',
    status: 'resolved',
    q: 'Synthetic',
    createdAt: row.createdAt,
    id,
  })
).toString('base64url');
const item = {
  ...row,
  body: 'PRIVATE_BODY_SENTINEL',
  updatedAt: row.createdAt,
  capabilities: { canManage: false },
};
function clientFor(
  value: unknown,
  status = 200,
  host = 'https://staging.example.com'
) {
  const fetch = vi.fn().mockResolvedValue(Response.json(value, { status }));
  return {
    client: new TuturuuuUserClient({
      accessToken: 'synthetic-token',
      baseUrl: host,
      fetch,
    }),
    fetch,
  };
}
function stdout() {
  return vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('feedback private output', () => {
  it.each([true, false])(
    'omits body and extra fields by default (json=%s)',
    async (json) => {
      const { client, fetch } = clientFor({
        ...item,
        reporter: 'PRIVATE_REPORTER',
      });
      const write = stdout();
      await runFeedbackCommand({
        client,
        flags: {},
        json,
        positionals: ['feedback', 'show', id],
      });
      const text = String(write.mock.calls[0]?.[0]);
      expect(text).not.toContain('PRIVATE_BODY_SENTINEL');
      expect(text).not.toContain('PRIVATE_REPORTER');
      expect(text).not.toContain('body');
      expect(fetch).toHaveBeenCalledWith(
        `https://staging.example.com/api/v1/product-feedback/${id}`,
        expect.objectContaining({ cache: 'no-store', method: 'GET' })
      );
      expect(
        new Headers(fetch.mock.calls[0]?.[1].headers).get('authorization')
      ).toBe('Bearer synthetic-token');
    }
  );
  it.each([true, false])(
    'allows private body only with explicit include-content (json=%s)',
    async (json) => {
      const { client } = clientFor(item);
      const write = stdout();
      await runFeedbackCommand({
        client,
        flags: { 'include-content': true },
        json,
        positionals: ['feedback', 'show', id],
      });
      expect(String(write.mock.calls[0]?.[0])).toContain(
        'PRIVATE_BODY_SENTINEL'
      );
    }
  );
  it('list returns exactly metadata and one explicit cursor, never private extras', async () => {
    const { client, fetch } = clientFor({
      items: [{ ...item, reporter: 'PRIVATE_REPORTER' }],
      nextCursor: 'opaque',
    });
    const write = stdout();
    await runFeedbackCommand({
      client,
      flags: {
        view: 'archive',
        status: 'resolved',
        search: 'Synthetic',
        limit: '10',
        cursor: boundCursor,
      },
      json: true,
      positionals: ['feedback', 'list'],
    });
    const result = JSON.parse(String(write.mock.calls[0]?.[0]));
    expect(result).toEqual({ items: [row], nextCursor: 'opaque' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      `https://staging.example.com/api/v1/product-feedback?view=archive&status=resolved&q=Synthetic&limit=10&cursor=${boundCursor}`
    );
  });
  it.each([true, false])(
    'escapes ANSI/control/format characters in every stdout format (json=%s)',
    async (json) => {
      const unsafe = '\x1b]52;c;secret\x07\r\n\x9b31m\u202e';
      const { client } = clientFor({ ...item, title: unsafe, body: unsafe });
      const write = stdout();
      await runFeedbackCommand({
        client,
        flags: { 'include-content': true },
        json,
        positionals: ['feedback', 'show', id],
      });
      const text = String(write.mock.calls[0]?.[0]);
      const content = json ? JSON.parse(text).body : text;
      expect(String(content).replaceAll('\n', '')).not.toMatch(
        /[\p{Cc}\p{Cf}]/u
      );
      expect(content).toContain('\\u001b');
      expect(content).toContain('\\u202e');
    }
  );
  it.each([400, 401, 403, 404, 503])(
    'uses safe status errors without raw provider content (%s)',
    async (status) => {
      const { client } = clientFor(
        {
          error: 'PRIVATE_BODY_SENTINEL',
          message: 'provider raw secret',
          extra: item,
        },
        status
      );
      const write = stdout();
      const stderr = vi
        .spyOn(process.stderr, 'write')
        .mockImplementation(() => true);
      await expect(
        runFeedbackCommand({
          client,
          flags: {},
          json: true,
          positionals: ['feedback', 'show', id],
        })
      ).rejects.toThrow(new RegExp(`feedback_\\w+ \\(${status}\\)`));
      expect(write).not.toHaveBeenCalled();
      expect(stderr).not.toHaveBeenCalled();
    }
  );
  it('maps transport/shape failures to generic unavailable', async () => {
    const { client } = clientFor({ body: 'private', providerError: 'raw' });
    stdout();
    await expect(
      runFeedbackCommand({
        client,
        flags: {},
        json: true,
        positionals: ['feedback', 'show', id],
      })
    ).rejects.toThrow('feedback_unavailable (503)');
  });
  it('reuses actual host-scoped refresh transport', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          session: {
            access_token: 'renewed',
            refresh_token: 'renewed-refresh',
            expires_at: 9999999999,
          },
        })
      )
      .mockResolvedValueOnce(Response.json(item));
    const client = new TuturuuuUserClient({
      accessToken: 'old',
      refreshToken: 'synthetic-refresh',
      expiresAt: 1,
      baseUrl: 'http://localhost:7803',
      fetch,
    });
    stdout();
    await runFeedbackCommand({
      client,
      flags: {},
      json: true,
      positionals: ['feedback', 'show', id],
    });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'http://localhost:7803/api/cli/auth/refresh'
    );
    expect(fetch.mock.calls[1]?.[0]).toBe(
      `http://localhost:7803/api/v1/product-feedback/${id}`
    );
    expect(
      new Headers(fetch.mock.calls[1]?.[1].headers).get('authorization')
    ).toBe('Bearer renewed');
  });
});

describe('feedback validation', () => {
  it.each([
    { watch: true },
    { all: true },
    { workspace: 'foreign' },
    { actor: id },
    { view: 'invalid' },
    { view: 'inbox', status: 'open' },
    { limit: '0' },
    { limit: '51' },
    { limit: '1e2' },
    { limit: true },
    { search: '\x1bsecret' },
    { search: 'x'.repeat(161) },
    { cursor: 'x'.repeat(1153) },
    { cursor: 'malformed' },
    { cursor: boundCursor },
    { json: 'false' },
    { 'include-content': true },
  ])('rejects bad list flags before any transport: %j', async (flags) => {
    const { client, fetch } = clientFor(item);
    await expect(
      runFeedbackCommand({
        client,
        flags,
        json: false,
        positionals: ['feedback', 'list'],
      })
    ).rejects.toThrow('feedback_invalid_arguments');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects duplicate raw flags without registration', () => {
    expect(() =>
      validateFeedbackCommand(['feedback', 'list'], { limit: '2' }, [
        'feedback',
        'list',
        '--limit',
        '1',
        '--limit=2',
      ])
    ).toThrow('feedback_invalid_arguments');
  });
  it('rejects an invalid show UUID before handler transport', async () => {
    const { client, fetch } = clientFor(item);
    await expect(
      runFeedbackCommand({
        client,
        flags: {},
        json: true,
        positionals: ['feedback', 'show', 'not-uuid'],
      })
    ).rejects.toThrow('feedback_invalid_arguments');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('normalizes an uppercase detail UUID before retrieval', () => {
    expect(
      validateFeedbackCommand(['feedback', 'show', id.toUpperCase()], {}).id
    ).toBe(id);
  });
  it('preserves null archivedAt and nextCursor in JSON metadata', async () => {
    const { client, fetch } = clientFor({ items: [row], nextCursor: null });
    const write = stdout();
    await runFeedbackCommand({
      client,
      flags: {},
      json: true,
      positionals: ['feedback', 'list'],
    });
    expect(JSON.parse(String(write.mock.calls[0]?.[0]))).toEqual({
      items: [row],
      nextCursor: null,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('escapes every Unicode control scalar without mutating ordinary text', () => {
    expect(feedbackTerminalText('plain tiếng Việt')).toBe('plain tiếng Việt');
    expect(feedbackTerminalText('\x00\x7f\u200b')).toBe(
      '\\u0000\\u007f\\u200b'
    );
  });
});
