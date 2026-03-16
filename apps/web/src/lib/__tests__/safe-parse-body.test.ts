import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { safeParseBody } from '../safe-parse-body';

function makeRequest(body: string, contentType = 'application/json') {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
}

describe('safeParseBody', () => {
  it('parses valid JSON body', async () => {
    const request = makeRequest(JSON.stringify({ name: 'hello' }));
    const result = await safeParseBody<{ name: string }>(request);

    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.name).toBe('hello');
    }
  });

  it('rejects body exceeding default byte limit', async () => {
    // Create a body larger than 512KB (new limit)
    const largeBody = JSON.stringify({ data: 'x'.repeat(600 * 1024) });
    const request = makeRequest(largeBody);
    const result = await safeParseBody(request);

    expect('data' in result).toBe(false);
    // It's a NextResponse
    if (!('data' in result)) {
      expect(result.status).toBe(413);
    }
  });

  it('rejects body exceeding custom byte limit', async () => {
    const body = JSON.stringify({ data: 'hello world' });
    const request = makeRequest(body);
    const result = await safeParseBody(request, 5); // 5 bytes limit

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(413);
    }
  });

  it('rejects emoji-heavy payload that exceeds byte limit', async () => {
    // Each emoji is ~4 bytes in UTF-8. 1000 emoji = ~4000 bytes
    const emojis = '🎉'.repeat(1000);
    const body = JSON.stringify({ data: emojis });
    const request = makeRequest(body);
    // Set limit to 2000 bytes — body will be ~4000+ bytes
    const result = await safeParseBody(request, 2000);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(413);
    }
  });

  it('accepts emoji payload within byte limit', async () => {
    const emojis = '🎉'.repeat(10);
    const body = JSON.stringify({ data: emojis });
    const request = makeRequest(body);
    const result = await safeParseBody<{ data: string }>(request);

    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.data).toBe(emojis);
    }
  });

  it('returns 400 for invalid JSON', async () => {
    const request = makeRequest('not valid json {}}}');
    const result = await safeParseBody(request);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(400);
    }
  });

  it('returns 400 for empty body', async () => {
    const request = makeRequest('');
    const result = await safeParseBody(request);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(400);
    }
  });
});
