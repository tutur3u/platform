import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { startFixtureWorker } from './runtime-fixture.mjs';

const workspace = '00000000-0000-4000-8000-000000000001';
const runId = '00000000-0000-4000-8000-000000000002';
const actor = '00000000-0000-4000-8000-000000000003';
// Disposable credentials accepted exclusively by this test's synthetic database.
const prefix = 'ttr_ai_0123456789abcdef';
const credential = `${prefix}_local-cancellation-fixture`;
const salt = 'cancellation-fixture';
const secretHash = `${salt}:${scryptSync(credential, salt, 64).toString('hex')}`;

test('disconnecting the emitted AI stream settles its real metering run as aborted', {
  timeout: 120000,
}, async (t) => {
  const settlements = [];
  const unexpected = [];
  let providerCalls = 0;
  let reservationCalls = 0;
  let settleObserved;
  const settled = new Promise((resolve) => {
    settleObserved = resolve;
  });
  const json = (value) => Response.json(value);
  const worker = await startFixtureWorker(t, {
    bindings: {
      SUPABASE_SERVER_URL: 'https://ai-cancellation.supabase.invalid',
      SUPABASE_SECRET_KEY: 'sb_secret_local_fixture',
      GOOGLE_GENERATIVE_AI_API_KEY: 'local-google-fixture',
    },
    async outboundService(request) {
      const url = new URL(request.url);
      if (url.origin === 'https://ai-cancellation.supabase.invalid') {
        const resource = url.pathname.split('/').at(-1);
        if (resource === 'ai_studio_api_keys')
          return json({
            id: '00000000-0000-4000-8000-000000000004',
            ws_id: workspace,
            created_by: actor,
            prefix,
            secret_hash: secretHash,
            revoked_at: null,
            expires_at: null,
            external_app_id: null,
          });
        if (resource === 'ai_gateway_models') return json({ type: 'language' });
        if (resource === 'calculate_ai_studio_usage_cost')
          return json([{ billed_credits: 1, provider_cost_usd: 0.001 }]);
        if (resource === 'begin_ai_studio_run') {
          reservationCalls++;
          return json([
            {
              success: true,
              run_id: runId,
              reservation_id: runId,
              remaining_credits: 100,
            },
          ]);
        }
        if (resource === 'settle_ai_studio_run') {
          settlements.push(await request.json());
          settleObserved();
          return json([{ success: true }]);
        }
        if (resource === 'ai_studio_run_steps') return json([]);
      }
      if (
        url.hostname === 'generativelanguage.googleapis.com' &&
        url.pathname.endsWith(':streamGenerateContent')
      ) {
        providerCalls++;
        const encoder = new TextEncoder();
        let timer;
        let chunks = 0;
        const stream = new ReadableStream({
          start(controller) {
            const tick = () => {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'fixture token ' }] }, index: 0 }] })}\n\n`
                )
              );
              if (++chunks === 100) {
                clearInterval(timer);
                controller.close();
              }
            };
            timer = setInterval(tick, 100);
            t.after(() => clearInterval(timer));
          },
          cancel() {
            clearInterval(timer);
          },
        });
        return new Response(stream, {
          headers: { 'content-type': 'text/event-stream' },
        });
      }
      unexpected.push(`${request.method} ${url.origin}${url.pathname}`);
      return new Response('Unexpected egress denied', { status: 500 });
    },
  });
  assert.ok(
    worker.config.compatibility_flags.includes('enable_request_signal')
  );
  const payload = JSON.stringify({
    model: 'google/gemini-3.5-flash-lite',
    stream: true,
    max_tokens: 16,
    messages: [{ role: 'user', content: 'fixture' }],
  });
  await new Promise((resolve, reject) => {
    const target = new URL('/v1/chat/completions', worker.origin);
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: {
          host: 'ai.tuturuuu.com',
          authorization: `Bearer ${credential}`,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () =>
            reject(new Error(`Stream rejected: ${res.statusCode}: ${body}`))
          );
          return;
        }
        assert.match(res.headers['content-type'] ?? '', /text\/event-stream/);
        res.once('data', (chunk) => {
          assert.match(chunk.toString(), /fixture token/);
          res.destroy();
          req.destroy();
          resolve();
        });
      }
    );
    req.on('error', reject);
    req.end(payload);
  });
  let deadline;
  try {
    await Promise.race([
      settled,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error('Disconnected run was not settled')),
          15000
        );
      }),
    ]);
  } finally {
    clearTimeout(deadline);
  }
  assert.equal(reservationCalls, 1);
  assert.equal(providerCalls, 1);
  assert.equal(settlements.length, 1);
  assert.equal(settlements[0].p_run_id, runId);
  assert.equal(settlements[0].p_status, 'aborted');
  assert.deepEqual(unexpected, []);
});
