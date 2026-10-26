import { expect, test } from 'bun:test';
import { z } from 'zod';
import { readJsonBody } from './body';
import type { SecurityAdapter } from './contracts';
import type { PipelineOptions } from './pipeline';
import { createApi as createPipeline } from './pipeline';

function createApi(options: PipelineOptions) {
  const run = createPipeline(options);
  return (
    request: Request,
    env: Parameters<typeof run>[1],
    execution: Parameters<typeof run>[2]
  ) =>
    run(
      request,
      {
        API_WORKER_OPERATIONS: options.endpoints
          .map((endpoint) => endpoint.operationId)
          .join(','),
        ...env,
      },
      execution
    );
}

import { defineRoute } from './registry';

const execution = { waitUntil: (_promise: Promise<unknown>) => {} };
const security: SecurityAdapter = {
  guard: async () => {},
  resolvePrincipal: async () => ({
    kind: 'user',
    userId: 'fixture',
    authentication: 'cookie',
    mfaVerified: true,
  }),
  authorize: async () => ({ kind: 'identity' }),
};
const operation = defineRoute({
  operationId: 'createExample',
  method: 'POST',
  path: '/api/v1/example',
  aliases: [],
  policy: { kind: 'user', requireMfa: true },
  guard: 'web-api',
  limits: { bodyBytes: 16, deadlineMs: 1000, ratePolicy: 'example-write' },
  input: z.object({
    params: z.object({}).strict(),
    query: z.object({}).strict(),
    body: z.object({ ok: z.boolean() }).strict(),
  }),
  output: z.object({ ok: z.boolean() }).strict(),
  body: 'json',
  status: 200,
  handle: ({ body }) => body,
});

function post(body: string, headers: Record<string, string> = {}) {
  return new Request('https://tuturuuu.com/api/v1/example', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'session=fixture',
      origin: 'https://tuturuuu.com',
      ...headers,
    },
    body,
  });
}

test('cookie writes require same-origin evidence even when CORS is allowed', async () => {
  const fetch = createApi({ endpoints: [operation], retained: [], security });
  expect((await fetch(post('{"ok":true}'), {}, execution)).status).toBe(200);
  expect(
    (
      await fetch(
        post('{"ok":true}', { origin: 'https://allowed.example' }),
        { ALLOWED_ORIGINS: 'https://allowed.example' },
        execution
      )
    ).status
  ).toBe(403);
  const noOrigin = post('{"ok":true}');
  noOrigin.headers.delete('origin');
  expect((await fetch(noOrigin, {}, execution)).status).toBe(403);
});

test('chunked body bounds do not rely on Content-Length and cancel the producer', async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"ok":true,"oversized":1}'));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('https://fixture.example', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  await expect(readJsonBody(request, 16)).rejects.toMatchObject({
    code: 'payload_too_large',
    status: 413,
  });
  expect(cancelled).toBe(true);
});

test('malformed JSON, extra fields and invalid output fail before returning success', async () => {
  const fetch = createApi({ endpoints: [operation], retained: [], security });
  expect((await fetch(post('{"ok":'), {}, execution)).status).toBe(400);
  expect((await fetch(post('{"other":true}'), {}, execution)).status).toBe(400);
  const invalid = defineRoute({
    ...operation,
    input: z.object({
      params: z.object({}),
      query: z.object({}),
      body: z.object({ ok: z.boolean() }),
    }),
    output: z.object({ ok: z.boolean().refine(() => false) }),
    handle: () => ({ ok: true }),
  });
  const invalidFetch = createApi({
    endpoints: [invalid],
    retained: [],
    security,
  });
  expect((await invalidFetch(post('{"ok":true}'), {}, execution)).status).toBe(
    500
  );
});

test('deadline cancels an incomplete body and never retries', async () => {
  let cancelled = false;
  let executions = 0;
  const slow = defineRoute({
    ...operation,
    limits: { ...operation.limits, deadlineMs: 10 },
    input: z.object({
      params: z.object({}),
      query: z.object({}),
      body: z.object({ ok: z.boolean() }),
    }),
    output: z.object({ ok: z.boolean() }),
    handle: () => {
      executions++;
      return { ok: true };
    },
  });
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const request = new Request('https://tuturuuu.com/api/v1/example', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  const fetch = createApi({ endpoints: [slow], retained: [], security });
  expect((await fetch(request, {}, execution)).status).toBe(504);
  expect(cancelled).toBe(true);
  expect(executions).toBe(0);
});
