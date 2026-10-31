// Signed D1 progress for the staging Web Next fallback (design §3.3).
//
// One row, `wave1-web-next-staging`, in the existing wave-1 control database.
// Entries move pending -> deployed -> verified, or end failed. Every write is
// a compare-and-swap on the complete authenticated preimage, signed with the
// staging deploy token under its own domain separator. Only the protected
// `wave1-web-next-staging` jobs write it; the Worker publisher only reads it
// and refuses on ANY mismatch (Tess condition (a)).
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

export const WEB_NEXT_LEDGER_KEY = 'wave1-web-next-staging';
const DOMAIN = 'wave1-web-next-v1';
const STATES = ['pending', 'deployed', 'verified', 'failed'];
const runIdPattern = /^[1-9][0-9]*$/u;
const deploymentPattern = /^dpl_[A-Za-z0-9]{8,64}$/u;

export function signWebNextState(data, token) {
  const raw = JSON.stringify(data);
  return JSON.stringify({
    data: raw,
    mac: createHmac('sha256', token).update(`${DOMAIN}\n${raw}`).digest('hex'),
  });
}

function verifiedState(raw, token, scope) {
  assert.equal(typeof raw, 'string', 'Missing Web Next ledger state');
  assert.ok(raw.length <= 256 * 1024, 'Web Next ledger exceeds budget');
  const envelope = JSON.parse(raw);
  assert.equal(typeof envelope.data, 'string', 'Invalid Web Next ledger');
  assert.match(
    envelope.mac ?? '',
    /^[a-f0-9]{64}$/u,
    'Invalid Web Next ledger signature'
  );
  const expected = JSON.parse(
    signWebNextState(JSON.parse(envelope.data), token)
  ).mac;
  assert.ok(
    timingSafeEqual(
      Buffer.from(envelope.mac, 'hex'),
      Buffer.from(expected, 'hex')
    ),
    'Invalid Web Next ledger signature'
  );
  const data = JSON.parse(envelope.data);
  assert.equal(data.schema, 1);
  assert.deepEqual(data.scope, scope, 'Web Next ledger scope mismatch');
  assert.ok(
    Array.isArray(data.entries) && data.entries.length < 100,
    'Web Next ledger incomplete'
  );
  for (const entry of data.entries) {
    assert.match(entry.sha ?? '', /^[a-f0-9]{40}$/u);
    assert.match(entry.runId ?? '', runIdPattern);
    assert.ok(STATES.includes(entry.state), 'Unknown Web Next ledger state');
    if (['deployed', 'verified'].includes(entry.state)) {
      assert.match(entry.deploymentId ?? '', deploymentPattern);
      assert.match(entry.origin ?? '', /^https:\/\/[a-z0-9-]+\.vercel\.app$/u);
    }
    if (entry.state === 'verified')
      assert.match(entry.verifyRunId ?? '', runIdPattern);
  }
  return data;
}

export async function webNextLedger({
  request,
  base,
  token,
  databaseId,
  repository,
  projectId,
}) {
  assert.match(
    databaseId ?? '',
    /^[a-f0-9-]{36}$/u,
    'Missing staging attempt D1 ID'
  );
  assert.match(
    projectId ?? '',
    /^prj_[A-Za-z0-9]{8,64}$/u,
    'Missing Vercel staging project id'
  );
  const scope = { databaseId, repository, app: 'web-next', projectId };
  const query = async (sql, params) => {
    const response = await request(
      `${base}/d1/database/${databaseId}/query`,
      token,
      { sql, params }
    );
    assert.equal(response.success, true, 'Web Next ledger request failed');
    assert.equal(response.result?.length, 1);
    assert.equal(
      response.result[0].success,
      true,
      'Web Next ledger query failed'
    );
    return response.result[0];
  };
  const read = async () => {
    const result = await query(
      'SELECT record FROM wave1_attempts WHERE app = ?',
      [WEB_NEXT_LEDGER_KEY]
    );
    assert.equal(
      result.results?.length,
      1,
      'Missing Web Next ledger row; owner seeding required'
    );
    const raw = result.results[0].record;
    return { raw, data: verifiedState(raw, token, scope) };
  };
  let { raw, data } = await read();
  const persist = async (entries) => {
    const signed = signWebNextState({ ...data, entries }, token);
    verifiedState(signed, token, scope);
    const result = await query(
      'UPDATE wave1_attempts SET record = ? WHERE app = ? AND record = ?',
      [signed, WEB_NEXT_LEDGER_KEY, raw]
    );
    assert.equal(
      result.meta?.changes,
      1,
      'Web Next ledger changed; never retry a deployment'
    );
    const observed = await read();
    assert.equal(observed.raw, signed, 'Web Next ledger readback differs');
    ({ raw, data } = observed);
  };
  const entryFor = (sha) => data.entries.find((entry) => entry.sha === sha);
  const update = async (sha, from, patch) => {
    const entry = entryFor(sha);
    assert.ok(
      entry && from.includes(entry.state),
      `Web Next ledger is ${entry?.state ?? 'missing'}, not ${from.join('/')}`
    );
    await persist(
      data.entries.map((item) =>
        item === entry ? { ...item, ...patch } : item
      )
    );
  };
  return {
    get entries() {
      return data.entries;
    },
    entryFor,
    /** Consumes the one deployment this SHA may ever make. */
    async start(sha, runId, runAttempt) {
      assert.equal(
        entryFor(sha),
        undefined,
        'This SHA already consumed its Next deployment'
      );
      const latest = data.entries[0];
      assert.ok(
        !latest || ['verified', 'failed'].includes(latest.state),
        'An earlier Next deployment is unresolved'
      );
      await persist([
        { sha, runId, runAttempt, state: 'pending' },
        ...data.entries,
      ]);
    },
    deployed: (sha, { deploymentId, origin }) =>
      update(sha, ['pending'], { state: 'deployed', deploymentId, origin }),
    verified: (sha, { deploymentId, verifyRunId, verifyRunAttempt }) => {
      assert.equal(
        entryFor(sha)?.deploymentId,
        deploymentId,
        'Verified a different deployment'
      );
      return update(sha, ['deployed'], {
        state: 'verified',
        verifyRunId,
        verifyRunAttempt,
      });
    },
    failed: (sha) => update(sha, ['pending', 'deployed'], { state: 'failed' }),
  };
}

/**
 * The Worker publisher's gate: the exact admitted pair must be the ledger's
 * verified entry for this SHA, deployment, project and origin.
 */
export function requireVerifiedNext(
  ledger,
  { sha, deploymentId, origin, projectId }
) {
  const entry = ledger.entryFor(sha);
  assert.ok(entry, 'No Web Next ledger entry for this SHA');
  assert.equal(
    entry.state,
    'verified',
    `Web Next deployment is ${entry.state}, not verified`
  );
  assert.equal(
    entry.deploymentId,
    deploymentId,
    'Admitted Next deployment differs from the verified one'
  );
  assert.equal(
    entry.origin,
    origin,
    'Sealed Next origin differs from the verified one'
  );
  assert.match(
    entry.verifyRunId ?? '',
    runIdPattern,
    'Verification run is not recorded'
  );
  assert.match(projectId ?? '', /^prj_/u);
  return entry;
}
