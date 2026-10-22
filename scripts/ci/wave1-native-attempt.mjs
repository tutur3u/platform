import assert from 'node:assert/strict';

const states = {
  pending: 'pending',
  uploaded: 'in_progress',
  activated: 'success',
  failed: 'failure',
};
const same = (payload, identity) =>
  payload.sha === identity.sha && payload.digest === identity.digest;

// The workflow serializes this environment without cancellation. A missing status
// (including expired provider history) is unresolved, never permission to replay.
export async function attemptLedger({ request, base, token, app, identity }) {
  const environment = `wave1-${app}-staging-attempt`;
  const entries = await request(
    `${base}/deployments?environment=${environment}&per_page=100`,
    token
  );
  assert.ok(
    Array.isArray(entries) && entries.length < 100,
    'Attempt history incomplete; publication blocked'
  );
  for (const entry of entries) {
    assert.ok(Number.isSafeInteger(entry.id) && entry.id > 0);
    assert.equal(entry.payload?.kind, 'wave1-publication-attempt');
    assert.equal(entry.payload.app, app);
  }
  const latest = entries[0];
  if (latest && !same(latest.payload, identity)) {
    const statuses = await request(
      `${base}/deployments/${latest.id}/statuses?per_page=1`,
      token
    );
    assert.ok(Array.isArray(statuses));
    assert.ok(
      (statuses[0]?.state === 'success' &&
        /^wave1:activated:[a-f0-9-]{36}$/.test(
          statuses[0]?.description ?? ''
        )) ||
        (statuses[0]?.state === 'failure' &&
          statuses[0]?.description === 'wave1:failed'),
      'Earlier publication attempt is unresolved'
    );
  }
  const prior = entries.find((entry) => same(entry.payload, identity));
  let id = prior?.id;
  return {
    prior,
    async start(rollback) {
      assert.equal(id, undefined, 'Artifact admission already consumed');
      const result = await request(`${base}/deployments`, token, {
        ref: identity.sha,
        environment,
        auto_merge: false,
        required_contexts: [],
        production_environment: false,
        transient_environment: false,
        payload: {
          kind: 'wave1-publication-attempt',
          app,
          ...identity,
          rollback,
        },
      });
      assert.ok(Number.isSafeInteger(result.id) && result.id > 0);
      id = result.id;
      await this.save('pending');
    },
    async save(state, versionId) {
      assert.ok(id && Object.hasOwn(states, state));
      await request(`${base}/deployments/${id}/statuses`, token, {
        state: states[state],
        description: `wave1:${state}${versionId ? `:${versionId}` : ''}`,
        auto_inactive: false,
      });
    },
  };
}
