import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { RecipeFailure, cfQueueJob } from './release-cf-queue.mjs';
import { safeData } from './release-cf-queue-payload.mjs';
import {
  record,
  input,
  authority,
  successful,
  job,
  run,
} from './release-cf-queue-test-helper.mjs';

for (const length of [37, 40, 64])
  test(`random ${length}-hex credentials are refused outside declared identifier shapes`, async () => {
    const value = randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
    assert.throws(() => safeData({ unreviewed: value }));
    const values = input();
    values.authorizationRefs = [value];
    assert.throws(() => cfQueueJob(structuredClone(record), values));
    const result = await run(authority(), async () => ({
      providerOperationId: 'version',
      verificationRefs: [value],
    }));
    assert.equal(result.status, 'unknown');
    assert.equal(result.providerOperationId, 'version');
    assert.equal(JSON.stringify(result).includes(value), false);
    if (length === 40)
      assert.doesNotThrow(() => safeData({ sourceSha: value }));
    else if (length === 64) {
      assert.doesNotThrow(() =>
        safeData({ sha256: value, artifact: { id: value } })
      );
      const allowed = input();
      allowed.artifact.id = value;
      assert.doesNotThrow(() => cfQueueJob(structuredClone(record), allowed));
    } else assert.throws(() => safeData({ artifact: { id: value } }));
  });
for (const shape of ['getter', 'proxy'])
  test(`throwing error ${shape} yields UNKNOWN without escaping`, async () => {
    const port = authority();
    let effects = 0;
    const result = await run(port, async () => {
      effects++;
      if (shape === 'proxy')
        throw new Proxy(
          {},
          {
            get() {
              throw new Error('access denied');
            },
          }
        );
      throw Object.defineProperty({}, 'guardCode', {
        get() {
          throw new Error('access denied');
        },
      });
    });
    assert.equal(effects, 1);
    assert.equal(result.status, 'unknown');
    assert.equal(result.cause.guardCode, 'EXECUTOR_UNCERTAIN');
    assert.equal(result.cause.providerContacted, true);
    assert.equal(
      port.state.receipts.get([...port.state.receipts.keys()][0]).status,
      'unknown'
    );
  });
for (const method of ['renew', 'checkpoint'])
  test(`post-effect ${method} refusal records contacted true`, async () => {
    const port = authority();
    let completed = false;
    const original = port[method].bind(port);
    port[method] = async (args) => {
      if (completed)
        throw new RecipeFailure('AUTHORITY_REFUSED', method, 'policy', {
          providerContacted: false,
        });
      return original(args);
    };
    const result = await run(port, async () => {
      completed = true;
      return successful();
    });
    assert.equal(result.status, 'unknown');
    assert.equal(result.cause.providerContacted, true);
    assert.equal(result.providerOperationId, 'recorded-version');
  });
test('typed structured readback refs with UUIDs and hex identifiers succeed', async () => {
  const uuid = randomUUID(),
    hex32 = randomBytes(16).toString('hex'),
    hex64 = randomBytes(32).toString('hex');
  const refs = [
    `workers/tuturuuu-finance/deployments/${uuid}`,
    `readback/finance/${hex32}`,
    `cf-wave1/finance/version-readback/${uuid}`,
    `readback/finance/${hex64}`,
  ];
  const result = await run(authority(), async () => ({
    providerOperationId: uuid,
    verificationRefs: refs,
  }));
  assert.equal(result.status, 'succeeded');
  assert.equal(result.providerOperationId, uuid);
  assert.deepEqual(result.verificationRefs, refs);
  assert.throws(() => safeData({ unreviewed: `readback/finance/${hex64}` }));
  assert.doesNotThrow(() =>
    safeData({
      artifact: { id: `https://artifacts.tuturuuu.com/sealed/${hex64}` },
    })
  );
});
test('invalid refs and extra outcome fields preserve validated provider identity', async () => {
  for (const outcome of [
    {
      providerOperationId: 'known-version',
      verificationRefs: ['readback/finance/' + randomBytes(20).toString('hex')],
    },
    {
      providerOperationId: 'known-version',
      verificationRefs: ['readback'],
      extra: 'unexpected',
    },
  ]) {
    const result = await run(authority(), async () => outcome);
    assert.equal(result.status, 'unknown');
    assert.equal(result.providerOperationId, 'known-version');
  }
});

for (const value of [
  'sbp_fixture',
  'npm_fixture',
  'Bearer fixture',
  'AbCDef0123456789XYZuvw-QRST9876543210mnopqr'.slice(0, 31),
])
  test(`additional credential shapes are refused (${value.length})`, async () => {
    assert.throws(() => safeData({ unreviewed: value }));
    const values = input();
    values.authorizationRefs = [value];
    assert.throws(() => cfQueueJob(structuredClone(record), values));
    const result = await run(authority(), async () => ({
      providerOperationId: 'known-version',
      verificationRefs: [value],
    }));
    assert.equal(result.status, 'unknown');
    assert.equal(result.providerOperationId, 'known-version');
  });

test('unsafe typed error metadata falls back without rejecting or copying credentials', async () => {
  const credential = randomBytes(20).toString('hex').toUpperCase();
  const result = await run(authority(), async () => {
    throw new RecipeFailure(credential, 'publish', 'executor');
  });
  assert.equal(result.status, 'unknown');
  assert.equal(result.cause.guardCode, 'EXECUTOR_UNCERTAIN');
  assert.equal(result.cause.providerContacted, true);
  assert.equal(JSON.stringify(result).includes(credential), false);
});
