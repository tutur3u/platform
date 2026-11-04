import assert from 'node:assert/strict';

// Production binds ABUSE_GUARD to the real limiter over RPC. Qualification never
// reaches it: the app role gets an in-process fetcher that answers every request
// with a fail-closed 503 and exposes no RPC surface, so any `run()` rejects and
// the limiter refuses (503) exactly as when the guard is unreachable.
export const ABUSE_GUARD_BINDING = 'ABUSE_GUARD';
export const REAL_ABUSE_GUARD = Object.freeze({
  binding: ABUSE_GUARD_BINDING,
  service: 'tuturuuu-abuse-guard',
  entrypoint: 'AbuseGuardEntrypoint',
});
export const ABUSE_GUARD_STUB = 'fixture:abuse-guard-stub';
export const STUB_STATUS = 503;
export const STUB_BODY = '{"error":"guard_unavailable"}';

const stubs = new WeakSet();

export function createAbuseGuardStub() {
  const calls = [];
  const fetcher = async (request) => {
    assert.ok(calls.length < 32, 'Abuse-guard stub call bound exceeded');
    const url = new URL(request.url);
    calls.push({ method: request.method, path: url.pathname });
    return new Response(STUB_BODY, {
      status: STUB_STATUS,
      headers: { 'content-type': 'application/json' },
    });
  };
  const binding = Object.freeze({ type: 'fetcher', fetcher });
  stubs.add(binding);
  return Object.freeze({ binding, calls });
}

/** Only a binding minted above is admitted; a service binding never is. */
export function admitAbuseGuardStub(binding) {
  assert.ok(stubs.has(binding), 'Abuse-guard binding must be the local stub');
  assert.deepEqual(
    Object.keys(binding).sort(),
    ['fetcher', 'type'],
    'Abuse-guard stub shape'
  );
  assert.equal(binding.type, 'fetcher', 'Abuse-guard stub must be in-process');
  assert.equal(typeof binding.fetcher, 'function');
  return binding;
}

/** The emitted config must name the real guard exactly; the edge must not. */
export function admitAbuseGuardEdge(services, edge) {
  const matches = services.filter((s) => s.binding === ABUSE_GUARD_BINDING);
  assert.equal(matches.length, 1, 'Exactly one ABUSE_GUARD service binding');
  assert.deepEqual(
    matches[0],
    { ...REAL_ABUSE_GUARD },
    'ABUSE_GUARD must bind the real guard entrypoint exactly'
  );
  assert.deepEqual(
    edge,
    ['app', ABUSE_GUARD_BINDING, 'stub-service', ABUSE_GUARD_STUB],
    'ABUSE_GUARD edge must be satisfied by the local stub'
  );
  assert.ok(
    !edge.includes(REAL_ABUSE_GUARD.service) &&
      !edge.includes(REAL_ABUSE_GUARD.entrypoint),
    'Qualification edge must never name the real guard'
  );
}
