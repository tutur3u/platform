import assert from 'node:assert/strict';
import test from 'node:test';
import './worker-test-runtime.mjs';

const { default: worker } = await import('./worker.ts');

const SECRET = 's'.repeat(40);
const MEETING = '2c3d4e5f-6071-4829-9bac-1d2e3f4a5b6c';
const body = {
  meetingId: MEETING,
  requester: '1b2c3d4e-5f60-4718-8a9b-0c1d2e3f4a5b',
  requestId: '3d4e5f60-7182-4930-8bcd-2e3f4a5b6c7d',
  language: 'cpp',
  files: [{ path: 'main.cpp', content: 'int main() {}\n' }],
};

function env({
  admission = { kind: 'admitted', admittedAt: 7 },
  outcome,
} = {}) {
  const calls = { admit: [], check: [] };
  return {
    calls,
    env: {
      PLAYGROUND_INGRESS_SECRET: SECRET,
      PLAYGROUND_OPERATOR_SECRET: 'o'.repeat(40),
      PLAYGROUND_COORDINATOR: {
        getByName: () => ({
          admitCheck: async (request) => {
            calls.admit.push(request);
            return admission;
          },
        }),
      },
      PLAYGROUND_CHECKER: {
        getByName: (name) => ({
          check: async (job) => {
            calls.check.push({ name, job });
            return outcome;
          },
        }),
      },
    },
  };
}

function post(payload, secret = SECRET) {
  return new Request('https://execution.example/check', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
    body: JSON.stringify(payload),
  });
}

test('a check is admitted, routed to the room checker and answered', async () => {
  const fx = env({
    outcome: {
      kind: 'checked',
      diagnostics: [],
      truncated: false,
      durationMs: 12,
    },
  });
  const response = await worker.fetch(post(body), fx.env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    requestId: body.requestId,
    diagnostics: [],
    truncated: false,
    durationMs: 12,
  });
  assert.deepEqual(fx.calls.admit, [
    { requestId: body.requestId, requester: body.requester, room: MEETING },
  ]);
  assert.deepEqual(fx.calls.check, [
    {
      name: `room-${MEETING}`,
      job: {
        requester: body.requester,
        admittedAt: 7,
        language: 'cpp',
        files: body.files,
      },
    },
  ]);
});

test('each check refusal has its status, code and retry hint', async () => {
  const cases = [
    [
      { kind: 'refused', reason: 'execution_paused' },
      undefined,
      503,
      { code: 'execution_paused' },
    ],
    [
      { kind: 'refused', reason: 'check_quota', retryAfterMs: 41_500 },
      undefined,
      429,
      { code: 'check_quota', retryAfterSeconds: 42 },
    ],
    [
      { kind: 'refused', reason: 'request_conflict' },
      undefined,
      409,
      { code: 'request_conflict' },
    ],
    [
      { kind: 'admitted', admittedAt: 7 },
      { kind: 'refused', reason: 'check_warming' },
      503,
      { code: 'check_warming' },
    ],
    [
      { kind: 'admitted', admittedAt: 7 },
      { kind: 'refused', reason: 'check_busy' },
      429,
      { code: 'check_busy' },
    ],
    [
      { kind: 'admitted', admittedAt: 7 },
      { kind: 'refused', reason: 'check_superseded' },
      409,
      { code: 'check_superseded' },
    ],
    [
      { kind: 'admitted', admittedAt: 7 },
      { kind: 'refused', reason: 'check_unavailable' },
      503,
      { code: 'check_unavailable' },
    ],
  ];
  for (const [admission, outcome, status, json] of cases) {
    const fx = env({ admission, outcome });
    const response = await worker.fetch(post(body), fx.env);
    assert.equal(response.status, status, json.code);
    assert.deepEqual(await response.json(), json);
    if (admission.kind === 'refused') assert.equal(fx.calls.check.length, 0);
  }
});

test('the check route rejects bad credentials and out-of-bounds input before admission', async () => {
  const fx = env();
  assert.equal(
    (await worker.fetch(post(body, 'x'.repeat(40)), fx.env)).status,
    401
  );
  const invalid = [
    { ...body, language: 'python' },
    { ...body, files: [] },
    {
      ...body,
      files: Array.from({ length: 21 }, (_, i) => ({
        path: `f${i}.c`,
        content: '',
      })),
    },
    { ...body, files: [{ path: '../etc/passwd', content: '' }] },
    { ...body, files: [{ path: 'a.c', content: 'x'.repeat(128 * 1024 + 1) }] },
    {
      ...body,
      files: Array.from({ length: 2 }, (_, i) => ({
        path: `f${i}.c`,
        content: 'x'.repeat(110 * 1024),
      })),
    },
    { ...body, files: [body.files[0], body.files[0]] },
    { ...body, command: 'rm -rf /' },
  ];
  for (const payload of invalid) {
    const response = await worker.fetch(post(payload), fx.env);
    assert.equal(response.status, 400);
  }
  assert.equal(fx.calls.admit.length, 0);
});

test('a pause stays draining until every check guest confirms it stopped', async () => {
  for (const [state, status] of [
    [{ enabled: false, generation: 2, active: 0, checkers: 1 }, 202],
    [{ enabled: false, generation: 2, active: 0, checkers: 0 }, 200],
  ]) {
    const fx = env();
    fx.env.PLAYGROUND_COORDINATOR.getByName = () => ({
      gate: async (enabled) => {
        assert.equal(enabled, false);
        return state;
      },
    });
    const response = await worker.fetch(
      new Request('https://execution.example/control', {
        method: 'POST',
        headers: { Authorization: `Bearer ${'o'.repeat(40)}` },
        body: JSON.stringify({ enabled: false }),
      }),
      fx.env
    );
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), state);
  }
});

test('an accepted Run logs only its runId and colo', async () => {
  const fx = env();
  const runId = '4e5f6071-8293-4a41-9cde-3f4a5b6c7d8e';
  fx.env.PLAYGROUND_COORDINATOR.getByName = () => ({
    enqueue: async () => ({ kind: 'accepted', runId, startedAt: 9 }),
  });
  const secret = 'ticket-user-content-'.repeat(4);
  const request = new Request('https://execution.example/run', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}` },
    body: JSON.stringify({
      ownerId: '5f607182-9304-4b52-8def-4a5b6c7d8e9f',
      projectId: '60718293-0415-4c63-9e0f-5b6c7d8e9fa0',
      meetingId: MEETING,
      requester: body.requester,
      requestId: body.requestId,
      revision: 1,
      stdin: 'secret stdin',
      sourceTicket: secret,
      exportTicket: secret,
    }),
  });
  Object.defineProperty(request, 'cf', { value: { colo: 'SIN' } });
  const lines = [];
  const original = console.info;
  console.info = (line) => lines.push(line);
  try {
    const response = await worker.fetch(request, fx.env);
    assert.equal(response.status, 202);
  } finally {
    console.info = original;
  }
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), {
    event: 'playground.run.accepted',
    runId,
    colo: 'SIN',
  });
  assert.equal(lines[0].includes('secret stdin'), false);
  assert.equal(lines[0].includes(secret), false);
});
