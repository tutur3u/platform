import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

// The staging deploy token is also the signing authority, never a PR job token.
export function signAttemptState(data, token) {
  const raw = JSON.stringify(data);
  return JSON.stringify({
    data: raw,
    mac: createHmac('sha256', token)
      .update(`wave1-staging-attempt-v1\n${raw}`)
      .digest('hex'),
  });
}
function verifiedState(raw, token, scope) {
  assert.equal(typeof raw, 'string', 'Missing durable attempt state');
  assert.ok(raw.length <= 512 * 1024, 'Attempt state exceeds budget');
  const envelope = JSON.parse(raw);
  assert.equal(typeof envelope.data, 'string', 'Invalid attempt state');
  assert.match(
    envelope.mac ?? '',
    /^[a-f0-9]{64}$/,
    'Invalid attempt signature'
  );
  const expected = JSON.parse(
    signAttemptState(JSON.parse(envelope.data), token)
  ).mac;
  assert.ok(
    timingSafeEqual(
      Buffer.from(envelope.mac, 'hex'),
      Buffer.from(expected, 'hex')
    ),
    'Invalid attempt signature'
  );
  const data = JSON.parse(envelope.data);
  assert.equal(data.schema, 1);
  assert.deepEqual(data.scope, scope, 'Attempt authority scope mismatch');
  assert.ok(
    Array.isArray(data.entries) && data.entries.length < 100,
    'Attempt history incomplete; publication blocked'
  );
  for (const entry of data.entries) {
    assert.match(entry.runId ?? '', /^[1-9][0-9]*$/);
    assert.match(entry.runAttempt ?? '', /^[1-9][0-9]*$/);
    assert.match(entry.payload?.sha ?? '', /^[a-f0-9]{40}$/);
    assert.match(entry.payload?.digest ?? '', /^[a-f0-9]{64}$/);
    assert.ok(
      ['pending', 'uploaded', 'activated', 'failed'].includes(entry.state)
    );
    if (['uploaded', 'activated'].includes(entry.state))
      assert.match(entry.versionId ?? '', /^[a-f0-9-]{36}$/);
  }
  return data;
}

/**
 * Read-only, authenticated view of one app's attempt row. Used by the
 * Worker-scoped rollback, which must never write the ledger.
 */
export async function readAttemptRecord({
  request,
  base,
  token,
  databaseId,
  scope,
  app,
}) {
  assert.match(
    databaseId ?? '',
    /^[a-f0-9-]{36}$/,
    'Missing staging attempt D1 ID'
  );
  const response = await request(
    `${base}/d1/database/${databaseId}/query`,
    token,
    {
      sql: 'SELECT record FROM wave1_attempts WHERE app = ?',
      params: [`wave1-${app}-staging`],
    }
  );
  assert.equal(response.success, true, 'Attempt database request failed');
  const rows = response.result?.[0]?.results;
  assert.equal(rows?.length, 1, 'Missing durable attempt state');
  return verifiedState(rows[0].record, token, scope);
}

export async function attemptLedger({
  request,
  base,
  token,
  databaseId,
  repository,
  app,
  identity,
  runId,
  runAttempt,
}) {
  assert.match(
    databaseId ?? '',
    /^[a-f0-9-]{36}$/,
    'Missing staging attempt D1 ID'
  );
  assert.match(runId ?? '', /^[1-9][0-9]*$/, 'Missing publication run ID');
  assert.match(
    runAttempt ?? '',
    /^[1-9][0-9]*$/,
    'Missing publication run attempt'
  );
  const scope = {
    databaseId,
    repository,
    app,
    worker: identity.worker,
    accountId: identity.accountId,
  };
  const key = `wave1-${app}-staging`;
  const query = async (sql, params) => {
    const response = await request(
      `${base}/d1/database/${databaseId}/query`,
      token,
      { sql, params }
    );
    assert.equal(response.success, true, 'Attempt database request failed');
    assert.equal(response.result?.length, 1);
    const result = response.result[0];
    assert.equal(result.success, true, 'Attempt database query failed');
    return result;
  };
  const read = async () => {
    const result = await query(
      'SELECT record FROM wave1_attempts WHERE app = ?',
      [key]
    );
    assert.equal(
      result.results?.length,
      1,
      'Missing durable attempt state; owner reconciliation required'
    );
    const raw = result.results[0].record;
    return { raw, data: verifiedState(raw, token, scope) };
  };
  let { raw, data } = await read();
  const latest = data.entries[0];
  const prior = data.entries.find(
    (entry) =>
      entry.payload.sha === identity.sha &&
      entry.payload.digest === identity.digest
  );
  if (prior)
    assert.deepEqual(
      prior.payload,
      { ...identity, rollback: prior.payload.rollback },
      'Attempt identity mismatch'
    );
  assert.ok(
    !latest ||
      latest === prior ||
      ['activated', 'failed'].includes(latest.state),
    'Earlier publication attempt is unresolved'
  );
  let current = prior;
  const persist = async (entries) => {
    const next = { ...data, entries };
    const signed = signAttemptState(next, token);
    verifiedState(signed, token, scope);
    // Compare the complete authenticated preimage; concurrent runners cannot both consume it.
    const result = await query(
      'UPDATE wave1_attempts SET record = ? WHERE app = ? AND record = ?',
      [signed, key, raw]
    );
    assert.equal(
      result.meta?.changes,
      1,
      'Attempt state changed or deleted; never retry upload'
    );
    const observed = await read();
    assert.equal(observed.raw, signed, 'Attempt state readback differs');
    raw = observed.raw;
    data = observed.data;
    current = data.entries.find(
      (entry) =>
        entry.payload.sha === identity.sha &&
        entry.payload.digest === identity.digest
    );
  };
  return {
    prior,
    async start(rollback) {
      assert.equal(current, undefined, 'Artifact admission already consumed');
      await persist([
        {
          runId,
          runAttempt,
          payload: { ...identity, rollback },
          state: 'pending',
        },
        ...data.entries,
      ]);
    },
    async save(state, versionId) {
      assert.ok(current && ['uploaded', 'activated', 'failed'].includes(state));
      assert.equal(current.payload.sha, identity.sha);
      assert.equal(current.payload.digest, identity.digest);
      await persist(
        data.entries.map((entry) =>
          entry === current
            ? { ...entry, state, ...(versionId ? { versionId } : {}) }
            : entry
        )
      );
    },
  };
}
