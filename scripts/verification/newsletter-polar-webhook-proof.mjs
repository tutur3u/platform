import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { productCreateToJSON } from '@polar-sh/sdk/models/components/productcreate';
import {
  validateEvent,
  WebhookVerificationError,
} from '@polar-sh/sdk/webhooks';

const catalog = JSON.parse(
  await readFile(
    new URL('./newsletter-polar-sandbox-products.json', import.meta.url),
    'utf8'
  )
);
assert.equal(catalog.length, 2);
for (const [index, request] of catalog.entries()) {
  const wire = JSON.parse(productCreateToJSON(request));
  assert.equal(wire.visibility, 'draft');
  assert.equal(wire.recurring_interval, 'month');
  assert.equal(wire.prices[0].price_amount, [200, 1000][index]);
  assert.equal(wire.prices[0].price_currency, 'usd');
}
console.log(
  'PASS: two draft recurring sandbox product requests serialize through the installed Polar SDK ($2 and $10).'
);

// Finite loopback proof only: no provider credentials, external calls or app writes.
const secret = randomBytes(32).toString('hex');
const seen = new Map();
const organizationId = '00000000-0000-4000-8000-000000000001';
const product = {
  id: '00000000-0000-4000-8000-000000000002',
  created_at: new Date().toISOString(),
  modified_at: null,
  trial_interval: null,
  trial_interval_count: null,
  name: 'Newsletter Tier 1 sandbox fixture',
  description: null,
  visibility: 'draft',
  recurring_interval: 'month',
  recurring_interval_count: 1,
  meter_interval: null,
  meter_interval_count: null,
  is_recurring: true,
  is_archived: false,
  organization_id: organizationId,
  metadata: { product_type: 'newsletter_tier', tier: 'tier_1' },
  prices: [],
  benefits: [],
  medias: [],
  attached_custom_fields: [],
};
const body = JSON.stringify({
  type: 'product.created',
  timestamp: new Date().toISOString(),
  data: product,
});

const server = createServer(async (request, response) => {
  try {
    if (request.method !== 'POST' || request.url !== '/webhooks/polar') {
      response.writeHead(404).end();
      return;
    }
    let bytes = 0;
    const chunks = [];
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 65536) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const event = validateEvent(rawBody, request.headers, secret);
    if (
      event.type !== 'product.created' ||
      event.data.organizationId !== organizationId
    ) {
      response.writeHead(403).end();
      return;
    }
    const id = request.headers['webhook-id'];
    if (seen.has(id) && seen.get(id) !== rawBody) {
      response.writeHead(409).end();
      return;
    }
    const duplicate = seen.has(id);
    seen.set(id, rawBody);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ duplicate }));
  } catch (error) {
    response
      .writeHead(error instanceof WebhookVerificationError ? 401 : 422)
      .end();
  }
});
server.requestTimeout = 5000;
server.headersTimeout = 5000;
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const url = `http://127.0.0.1:${address.port}/webhooks/polar`;
function signedHeaders(
  payload,
  id = 'fixture-event-1',
  ageSeconds = 0,
  signingSecret = secret
) {
  const timestamp = String(Math.floor(Date.now() / 1000) - ageSeconds);
  const signature = createHmac('sha256', signingSecret)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');
  return {
    'Content-Type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': timestamp,
    'webhook-signature': `v1,${signature}`,
  };
}
async function post(payload, headers) {
  return fetch(url, {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
    headers,
    body: payload,
  });
}
try {
  const headers = signedHeaders(body);
  const valid = await post(body, headers);
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { duplicate: false });
  const replay = await post(body, headers);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { duplicate: true });
  assert.equal((await post(`${body} `, headers)).status, 401);
  assert.equal((await post(body, {})).status, 401);
  assert.equal(
    (await post(body, signedHeaders(body, 'stale', 600))).status,
    401
  );
  assert.equal(
    (await post(body, signedHeaders(body, 'wrong-key', 0, 'wrong'))).status,
    401
  );
  const foreign = body.replace(
    organizationId,
    '00000000-0000-4000-8000-000000000099'
  );
  assert.equal(
    (await post(foreign, signedHeaders(foreign, 'foreign'))).status,
    403
  );
  const changed = body.replace('sandbox fixture', 'changed fixture');
  assert.equal((await post(changed, signedHeaders(changed))).status, 409);
  assert.equal(seen.size, 1);
  console.log(
    'PASS: valid signed product event, duplicate, tampered body, missing signature, stale timestamp, wrong key, foreign organization and changed replay (8 loopback requests).'
  );
  console.log(
    'Synthetic fixture only; no Polar sandbox product, hosted webhook or durable app idempotency is proven.'
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
