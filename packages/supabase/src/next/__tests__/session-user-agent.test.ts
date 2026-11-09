import { createServer, type IncomingHttpHeaders } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import {
  sessionUserAgentHeaderValue,
  sessionUserAgentHeaders,
} from '../session-user-agent';

const browserUserAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function captureAuthTokenRequest(globalHeaders?: Record<string, string>) {
  let captured:
    | {
        headers: IncomingHttpHeaders;
        url: string | undefined;
      }
    | undefined;
  const server = createServer((request, response) => {
    captured = { headers: request.headers, url: request.url };
    response.writeHead(400, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        error: 'invalid_grant',
        error_description: 'stub',
      })
    );
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('auth stub did not bind a port');
  }

  try {
    const client = createClient(
      `http://127.0.0.1:${address.port}`,
      'test-publishable-key',
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
        ...(globalHeaders ? { global: { headers: globalHeaders } } : {}),
      }
    );
    await client.auth.signInWithPassword({
      email: 'person@example.com',
      password: 'secret',
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  if (!captured) {
    throw new Error('auth stub received no request');
  }

  return captured;
}

describe('session user-agent header', () => {
  it('keeps only a sanitized user-agent', () => {
    expect(sessionUserAgentHeaderValue(undefined)).toBeUndefined();
    expect(sessionUserAgentHeaderValue('   \n\t')).toBeUndefined();
    expect(sessionUserAgentHeaderValue(`a${'b'.repeat(600)}`)).toHaveLength(
      512
    );

    const headers = sessionUserAgentHeaders({
      get(name: string) {
        const values: Record<string, string> = {
          authorization: 'Bearer stolen-user-jwt',
          cookie: 'sb-secret=1',
          'user-agent': `  ${browserUserAgent}\r\nX-Injected: yes  `,
          'x-forwarded-for': '203.0.113.9',
        };
        return values[name.toLowerCase()] ?? null;
      },
    });

    expect(headers).toEqual({
      'User-Agent': `${browserUserAgent} X-Injected: yes`,
    });
    expect(Object.keys(headers ?? {})).toEqual(['User-Agent']);
  });

  it('stores node when the auth client omits User-Agent', async () => {
    const captured = await captureAuthTokenRequest();

    expect(captured.url).toContain('/auth/v1/token');
    expect(captured.headers['user-agent']).toBe('node');
  });

  it('sends the sanitized user-agent and no copied request metadata', async () => {
    const incoming = new Headers({
      authorization: 'Bearer stolen-user-jwt',
      cookie: 'sb-secret=1',
      'user-agent': browserUserAgent,
      'x-forwarded-for': '203.0.113.9',
    });
    const forwarded = sessionUserAgentHeaders(incoming);
    const captured = await captureAuthTokenRequest(forwarded);
    const serialized = JSON.stringify(captured.headers);

    expect(forwarded).toEqual({ 'User-Agent': browserUserAgent });
    expect(captured.headers['user-agent']).toBe(browserUserAgent);
    expect(captured.headers['x-forwarded-for']).toBeUndefined();
    expect(captured.headers.cookie).toBeUndefined();
    expect(serialized).not.toContain('stolen-user-jwt');
    expect(serialized).not.toContain('203.0.113.9');
    expect(serialized).not.toContain('sb-secret');
  });
});
