import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { adminFetch } from './post-reset-ai-credits.js';

const originalFetch = globalThis.fetch;
const originalWarn = console.warn;

afterEach(() => {
  globalThis.fetch = originalFetch;
  console.warn = originalWarn;
});

test('adminFetch retries the local PostgREST schema-cache startup response', async () => {
  const calls = [];
  console.warn = () => {};
  globalThis.fetch = async (url, init) => {
    calls.push({ init, url });

    if (calls.length === 1) {
      return new Response(
        JSON.stringify({
          code: 'PGRST002',
          message:
            'Could not query the database for the schema cache. Retrying.',
        }),
        {
          status: 503,
          statusText: 'Service Unavailable',
        }
      );
    }

    return new Response(null, {
      status: 204,
      statusText: 'No Content',
    });
  };

  const response = await adminFetch(
    'http://localhost:8001',
    'service-role-key',
    '/rest/v1/ai_gateway_models?on_conflict=id',
    { method: 'POST' },
    1_000,
    { maxAttempts: 2, retryDelayMs: 0 }
  );

  assert.equal(response.status, 204);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer service-role-key');
});

test('adminFetch does not retry non-startup Supabase REST errors', async () => {
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;

    return new Response(JSON.stringify({ message: 'Bad request' }), {
      status: 400,
      statusText: 'Bad Request',
    });
  };

  await assert.rejects(
    adminFetch(
      'http://localhost:8001',
      'service-role-key',
      '/rest/v1/ai_gateway_models',
      {},
      1_000,
      { maxAttempts: 3, retryDelayMs: 0 }
    ),
    /Supabase request failed \(400 Bad Request\)/
  );
  assert.equal(callCount, 1);
});
