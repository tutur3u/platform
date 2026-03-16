import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateRequestBody } from '../api-middleware';

function makeRequest(body: string, contentType = 'application/json') {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': contentType },
    body,
  });
}

const testSchema = z.object({
  name: z.string().max(255),
  description: z.string().max(10000).optional(),
});

describe('validateRequestBody', () => {
  it('validates valid JSON against Zod schema', async () => {
    const request = makeRequest(JSON.stringify({ name: 'hello' }));
    const result = await validateRequestBody(request, testSchema);

    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.name).toBe('hello');
    }
  });

  it('returns 413 when body exceeds default byte limit', async () => {
    const largeBody = JSON.stringify({ name: 'x'.repeat(600 * 1024) });
    const request = makeRequest(largeBody);
    const result = await validateRequestBody(request, testSchema);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(413);
      const body = await result.json();
      expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    }
  });

  it('returns 413 when body exceeds custom byte limit', async () => {
    const body = JSON.stringify({ name: 'hello world test' });
    const request = makeRequest(body);
    const result = await validateRequestBody(request, testSchema, 10);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(413);
    }
  });

  it('returns 413 for emoji-heavy payload exceeding byte limit', async () => {
    // 500 emojis × 4 bytes = ~2000 bytes, plus JSON overhead
    const emojis = '🎉'.repeat(500);
    const body = JSON.stringify({ name: emojis });
    const request = makeRequest(body);
    const result = await validateRequestBody(request, testSchema, 1000);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(413);
    }
  });

  it('returns 400 for invalid JSON', async () => {
    const request = makeRequest('{invalid json!!!}');
    const result = await validateRequestBody(request, testSchema);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.code).toBe('INVALID_JSON');
    }
  });

  it('returns 400 for valid JSON that fails Zod schema', async () => {
    // name is required but missing
    const request = makeRequest(JSON.stringify({ description: 'hello' }));
    const result = await validateRequestBody(request, testSchema);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(400);
      const body = await result.json();
      expect(body.code).toBe('INVALID_REQUEST_BODY');
    }
  });

  it('returns 400 when Zod max constraint is violated', async () => {
    // name exceeds .max(255)
    const request = makeRequest(JSON.stringify({ name: 'a'.repeat(256) }));
    const result = await validateRequestBody(request, testSchema);

    expect('data' in result).toBe(false);
    if (!('data' in result)) {
      expect(result.status).toBe(400);
    }
  });

  it('accepts body with optional fields', async () => {
    const request = makeRequest(
      JSON.stringify({ name: 'test', description: 'a description' })
    );
    const result = await validateRequestBody(request, testSchema);

    expect('data' in result).toBe(true);
    if ('data' in result) {
      expect(result.data.name).toBe('test');
      expect(result.data.description).toBe('a description');
    }
  });
});
