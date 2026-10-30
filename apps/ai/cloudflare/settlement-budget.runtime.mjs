import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { startFixtureWorker } from './runtime-fixture.mjs';

const identities = ['a', 'b'].map((name, index) => {
  const id = (suffix) =>
    `00000000-0000-4000-8000-${String(index * 10 + suffix).padStart(12, '0')}`;
  const prefix = `ttr_ai_${String(index + 1).padStart(16, '0')}`;
  const credential = `${prefix}_local-budget-fixture`;
  const salt = 'budget-fixture';
  return {
    name,
    workspace: id(1),
    run: id(2),
    actor: id(3),
    key: id(4),
    prefix,
    credential,
    request: `settlement-budget-${name}`,
    hash: `${salt}:${scryptSync(credential, salt, 64).toString('hex')}`,
  };
});
const [a, b] = identities;

function deferred(t, description, timeout = 15000) {
  const result = Promise.withResolvers();
  let timer;
  t.after(() => clearTimeout(timer));
  return {
    promise: result.promise,
    arm() {
      timer = setTimeout(
        () => result.reject(new Error(`${description} was not observed`)),
        timeout
      );
    },
    resolve(value) {
      clearTimeout(timer);
      result.resolve(value);
    },
  };
}

function disconnectStream(worker, identity) {
  const payload = JSON.stringify({
    model: 'google/gemini-3.5-flash-lite',
    stream: true,
    max_tokens: 16,
    messages: [{ role: 'user', content: `fixture-${identity.name}` }],
  });
  return new Promise((resolve, reject) => {
    const target = new URL('/v1/chat/completions', worker.origin);
    const req = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: {
          host: 'ai.tuturuuu.com',
          authorization: `Bearer ${identity.credential}`,
          'x-request-id': identity.request,
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
}

for (const phase of ['pricing', 'settlement']) {
  test(`emitted Worker bounds stalled ${phase} after disconnect and isolates a concurrent run`, {
    timeout: 120000,
  }, async (t) => {
    const calls = [];
    const steps = [];
    const unexpected = [];
    const pricingCalls = new Map();
    const stalled = deferred(t, `stalled ${phase}`);
    const journaled = deferred(t, 'reconciliation journal');
    const normalSettled = deferred(t, 'concurrent settlement');
    // Attach rejection handlers immediately while the Worker starts.
    void stalled.promise.catch(() => {});
    void journaled.promise.catch(() => {});
    void normalSettled.promise.catch(() => {});
    const worker = await startFixtureWorker(t, {
      bindings: {
        SUPABASE_SERVER_URL: 'https://ai-budget.supabase.invalid',
        SUPABASE_SECRET_KEY: 'sb_secret_local_budget_fixture',
        GOOGLE_GENERATIVE_AI_API_KEY: 'local-google-budget-fixture',
      },
      async outboundService(request) {
        const url = new URL(request.url);
        if (url.origin === 'https://ai-budget.supabase.invalid') {
          const resource = url.pathname.split('/').at(-1);
          if (resource === 'ai_studio_api_keys') {
            const identity = identities.find(
              (item) => url.searchParams.get('prefix') === `eq.${item.prefix}`
            );
            assert.ok(
              identity,
              'Authentication must resolve the requested key'
            );
            return Response.json({
              id: identity.key,
              ws_id: identity.workspace,
              created_by: identity.actor,
              prefix: identity.prefix,
              secret_hash: identity.hash,
              revoked_at: null,
              expires_at: null,
              external_app_id: null,
            });
          }
          if (resource === 'ai_gateway_models')
            return Response.json({ type: 'language' });
          const body = await request.json();
          calls.push({ resource, body });
          if (resource === 'begin_ai_studio_run') {
            const identity = identities.find(
              (item) => item.request === body.p_request_id
            );
            assert.ok(identity);
            assert.equal(body.p_ws_id, identity.workspace);
            assert.equal(body.p_user_id, identity.actor);
            return Response.json([
              {
                success: true,
                run_id: identity.run,
                reservation_id: identity.run,
                remaining_credits: 100,
              },
            ]);
          }
          let shouldStall = false;
          if (resource === 'calculate_ai_studio_usage_cost') {
            const count = (pricingCalls.get(body.p_ws_id) ?? 0) + 1;
            pricingCalls.set(body.p_ws_id, count);
            shouldStall =
              phase === 'pricing' && body.p_ws_id === a.workspace && count > 1;
          }
          if (resource === 'settle_ai_studio_run') {
            shouldStall = phase === 'settlement' && body.p_run_id === a.run;
          }
          if (shouldStall) {
            stalled.resolve();
            // A real fetch-body read stalls until its scoped transport is aborted.
            return new Response(
              new ReadableStream({
                start(controller) {
                  controller.enqueue(new TextEncoder().encode('['));
                  t.after(() => {
                    try {
                      controller.close();
                    } catch {}
                  });
                },
              }),
              { headers: { 'content-type': 'application/json' } }
            );
          }
          if (resource === 'calculate_ai_studio_usage_cost')
            return Response.json([
              { billed_credits: 2, provider_cost_usd: 0.001 },
            ]);
          if (resource === 'settle_ai_studio_run') {
            if (body.p_run_id === b.run) normalSettled.resolve(body);
            return Response.json([{ success: true }]);
          }
          if (resource === 'ai_studio_run_steps') {
            steps.push(body);
            if (body.name === 'settlement_reconciliation')
              journaled.resolve(body);
            return Response.json([]);
          }
        }
        if (
          url.hostname === 'generativelanguage.googleapis.com' &&
          url.pathname.endsWith(':streamGenerateContent')
        ) {
          let timer;
          let chunks = 0;
          const stream = new ReadableStream({
            start(controller) {
              timer = setInterval(() => {
                controller.enqueue(
                  new TextEncoder().encode(
                    `data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'fixture token ' }] }, index: 0 }] })}\n\n`
                  )
                );
                if (++chunks === 100) {
                  clearInterval(timer);
                  controller.close();
                }
              }, 100);
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
    stalled.arm();
    journaled.arm();
    normalSettled.arm();
    await disconnectStream(worker, a);
    const disconnectedAt = performance.now();
    await stalled.promise;
    await disconnectStream(worker, b);
    const normal = await normalSettled.promise;
    assert.equal(normal.p_run_id, b.run);
    assert.equal(normal.p_status, 'aborted');
    assert.equal(normal.p_actual_credits, 2);
    assert.equal(
      steps.filter((step) => step.name === 'settlement_reconciliation').length,
      0,
      'Concurrent request must settle while the original I/O is still pending'
    );
    const journal = await journaled.promise;
    assert.ok(
      performance.now() - disconnectedAt < 15000,
      'Must journal inside the existing disconnect deadline'
    );
    assert.equal(journal.run_id, a.run);
    assert.equal(journal.status, 'failed');
    assert.equal(journal.error_class, 'SettlementCompletionUnknown');
    assert.deepEqual(journal.metadata, {
      reconciliation_required: true,
      completion: 'unknown',
      phase,
      run_id: a.run,
      request_id: a.request,
      actor_id: a.actor,
      workspace_id: a.workspace,
      model_id: 'google/gemini-3.5-flash-lite',
      requested_status: 'aborted',
      usage: journal.metadata.usage,
      started_at: journal.metadata.started_at,
    });
    assert.ok(
      journal.metadata.usage.outputTokens > 0,
      'Retain consumed partial usage'
    );
    assert.ok(Number.isFinite(Date.parse(journal.metadata.started_at)));
    assert.equal(
      calls.filter((call) => call.resource === 'begin_ai_studio_run').length,
      2
    );
    const aSettlements = calls.filter(
      (call) =>
        call.resource === 'settle_ai_studio_run' && call.body.p_run_id === a.run
    );
    assert.equal(aSettlements.length, phase === 'pricing' ? 0 : 1);
    assert.ok(
      aSettlements.every((call) => call.body.p_actual_credits === 2),
      'Never refund unknown completion as zero'
    );
    assert.equal(
      steps.filter((step) => step.name === 'settlement_reconciliation').length,
      1
    );
    assert.deepEqual(unexpected, []);
  });
}
