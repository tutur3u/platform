import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  changeCustomDomainState,
  claimCustomDomain,
  type CustomDomain,
  defaultHostname,
  type DomainVerification,
  type HostingSnapshot,
  normalizeHostname,
  resolveWorldHost,
  verifyCustomDomain,
} from './host-routing';
import {
  beginProviderAttempt,
  completeProviderAttempt,
  createProviderOperation,
  stopProviderOperation,
} from './provider-operation';

const namespace = 'worlds.tuturuuu.com';
const publication = {
  workspaceId: 'workspace-a',
  worldId: 'world-a',
  releaseId: 'release-a',
};
const claim = {
  id: 'claim-a',
  hostname: 'example.com',
  workspaceId: publication.workspaceId,
  worldId: publication.worldId,
};
const proof: DomainVerification = {
  ...publication,
  claimId: claim.id,
  hostname: claim.hostname,
  dnsVerified: true,
  tlsActive: true,
  expiresAt: 20,
};

function snapshot(domain?: CustomDomain): HostingSnapshot {
  return {
    namespace,
    defaults: new Map([[`garden.${namespace}`, publication]]),
    customDomains: new Map(domain ? [[domain.hostname, domain]] : []),
    publications: new Map([[publication.worldId, publication]]),
  };
}

test('canonicalizes hostnames and rejects ambiguous authorities', () => {
  assert.equal(normalizeHostname('EXAMPLE.COM.'), 'example.com');
  assert.equal(
    normalizeHostname('xn--bcher-kva.example'),
    'xn--bcher-kva.example'
  );
  for (const input of [
    'example.com:443',
    'example.com\n',
    'example.com..',
    'example.com,other.example',
    'example.com/path',
    'user@example.com',
    '*.example.com',
    '127.0.0.1',
    '[::1]',
    '-bad.example',
    'example',
    `${'a'.repeat(64)}.example`,
  ]) {
    assert.equal(normalizeHostname(input), null, input);
  }
});

test('routes an assigned default and rejects unknown or unpublished worlds', () => {
  assert.equal(defaultHostname('Garden', namespace), `garden.${namespace}`);
  assert.equal(defaultHostname('nested.garden', namespace), null);
  assert.deepEqual(resolveWorldHost(`Garden.${namespace}.`, snapshot(), 10), {
    status: 'published',
    publication,
  });
  for (const hostname of [namespace, `missing.${namespace}`, 'other.example']) {
    assert.deepEqual(resolveWorldHost(hostname, snapshot(), 10), {
      status: 'unknown',
    });
  }

  const empty = { ...snapshot(), publications: new Map() };
  assert.equal(
    resolveWorldHost(`garden.${namespace}`, empty, 10).status,
    'disabled'
  );

  const foreign = {
    ...snapshot(),
    publications: new Map([
      [claim.worldId, { ...publication, workspaceId: 'workspace-b' }],
    ]),
  };
  assert.equal(
    resolveWorldHost(`garden.${namespace}`, foreign, 10).status,
    'disabled'
  );
});

test('requires matching current DNS ownership and TLS evidence', () => {
  const pending = claimCustomDomain(claim, claim.workspaceId, namespace, null);
  assert.ok(pending);
  assert.equal(
    resolveWorldHost(claim.hostname, snapshot(pending), 10).status,
    'disabled'
  );
  for (const evidence of [
    { ...proof, claimId: 'old-claim' },
    { ...proof, hostname: 'other.example' },
    { ...proof, worldId: 'other-world' },
    { ...proof, workspaceId: 'other-workspace' },
    { ...proof, dnsVerified: false },
    { ...proof, tlsActive: false },
    { ...proof, expiresAt: 10 },
    { ...proof, expiresAt: Infinity },
  ]) {
    assert.equal(verifyCustomDomain(pending, evidence, 10), null);
  }

  const verified = verifyCustomDomain(pending, proof, 10);
  assert.ok(verified);
  assert.deepEqual(resolveWorldHost('EXAMPLE.COM.', snapshot(verified), 19), {
    status: 'published',
    publication,
  });
  assert.equal(
    resolveWorldHost(claim.hostname, snapshot(verified), 20).status,
    'disabled'
  );
});

test('restricts claims and lifecycle transitions to the owner and fences old evidence', () => {
  const owner = claim.workspaceId;
  const foreign = { ...claim, id: 'claim-b', workspaceId: 'workspace-b' };
  const pending = claimCustomDomain(claim, owner, namespace, null);
  assert.ok(pending);
  assert.equal(claimCustomDomain(claim, 'workspace-b', namespace, null), null);
  assert.equal(
    claimCustomDomain(foreign, foreign.workspaceId, namespace, pending),
    null
  );
  for (const hostname of [namespace, `nested.garden.${namespace}`]) {
    assert.equal(
      claimCustomDomain({ ...claim, hostname }, owner, namespace, null),
      null
    );
  }

  const verified = verifyCustomDomain(pending, proof, 10);
  assert.ok(verified);
  assert.equal(
    changeCustomDomainState(verified, 'workspace-b', { type: 'release' }),
    null
  );
  const suspended = changeCustomDomainState(verified, owner, {
    type: 'suspend',
  });
  assert.ok(suspended);
  assert.equal(
    resolveWorldHost(claim.hostname, snapshot(suspended), 10).status,
    'disabled'
  );
  assert.equal(verifyCustomDomain(suspended, proof, 10), null);

  assert.equal(
    claimCustomDomain(foreign, foreign.workspaceId, namespace, suspended),
    null
  );

  const resumed = changeCustomDomainState(suspended, owner, {
    type: 'resume',
    newClaimId: 'claim-resumed',
  });
  assert.ok(resumed);
  assert.equal(verifyCustomDomain(resumed, proof, 10), null);
  const released = changeCustomDomainState(resumed, owner, { type: 'release' });
  assert.ok(released);
  assert.equal(
    resolveWorldHost(claim.hostname, snapshot(released), 10).status,
    'disabled'
  );
  assert.equal(
    changeCustomDomainState(released, owner, {
      type: 'resume',
      newClaimId: 'x',
    }),
    null
  );
  const reclaimed = claimCustomDomain(
    foreign,
    foreign.workspaceId,
    namespace,
    released
  );
  assert.ok(reclaimed);
  assert.equal(verifyCustomDomain(reclaimed, proof, 10), null);
});

test('caps retries and fences duplicate or stale receipts across a restart', () => {
  const operation = createProviderOperation('operation-a', 20);
  assert.ok(operation);
  let ready = operation;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const running = beginProviderAttempt(ready, 10);
    assert.ok(running);
    assert.equal(beginProviderAttempt({ ...running }, 10), null);
    const receipt = {
      operationId: running.id,
      attempt,
      outcome: 'retryable-no-effect' as const,
    };
    assert.equal(
      completeProviderAttempt(running, { ...receipt, attempt: attempt - 1 }),
      null
    );
    assert.equal(
      completeProviderAttempt(running, { ...receipt, operationId: 'foreign' }),
      null
    );
    const next = completeProviderAttempt(running, receipt);
    assert.ok(next);
    assert.equal(completeProviderAttempt(next, receipt), null);
    ready = next;
  }
  assert.equal(ready.state, 'failed');
  assert.equal(beginProviderAttempt(ready, 10), null);
  assert.equal(beginProviderAttempt(operation, 20), null);
});

test('stop and ambiguous provider outcomes prevent redispatch', () => {
  const operation = createProviderOperation('operation-a', 20);
  assert.ok(operation);
  const running = beginProviderAttempt(operation, 10);
  assert.ok(running);
  const receipt = {
    operationId: operation.id,
    attempt: 1,
    outcome: 'unknown' as const,
  };
  const unknown = completeProviderAttempt(running, receipt);
  assert.ok(unknown);
  assert.equal(beginProviderAttempt(unknown, 11), null);
  const stopped = stopProviderOperation(running);
  assert.equal(stopped.state, 'stopped');
  assert.equal(beginProviderAttempt({ ...stopped }, 11), null);
  assert.equal(completeProviderAttempt(stopped, receipt), null);
  assert.equal(
    beginProviderAttempt(stopProviderOperation(operation), 11),
    null
  );
});

test('a successful provider receipt closes the operation', () => {
  const operation = createProviderOperation('operation-a', 20);
  assert.ok(operation);
  const running = beginProviderAttempt(operation, 10);
  assert.ok(running);
  const receipt = {
    operationId: operation.id,
    attempt: 1,
    outcome: 'succeeded' as const,
  };
  const succeeded = completeProviderAttempt(running, receipt);
  assert.ok(succeeded);
  assert.equal(succeeded.state, 'succeeded');
  assert.equal(stopProviderOperation(succeeded), succeeded);
  assert.equal(completeProviderAttempt(succeeded, receipt), null);
  assert.equal(beginProviderAttempt(succeeded, 11), null);
});
