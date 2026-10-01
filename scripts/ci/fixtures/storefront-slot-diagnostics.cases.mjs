import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureStorefrontSlotDiagnostics } from '../../../apps/inventory/e2e/helpers/storefront-slot-diagnostics.ts';

function fixture({
  setupError,
  listenerError,
  unavailable = [],
  attachmentError,
} = {}) {
  const calls = [];
  const attachments = [];
  let listener;
  const session = {
    on(_event, callback) {
      if (listenerError) throw listenerError;
      listener = callback;
    },
    async send(method, params) {
      calls.push({ method, params });
      if (method === 'Debugger.enable') {
        if (setupError) throw setupError;
        return {};
      }
      if (unavailable.includes(params.scriptId))
        throw new Error('source unavailable');
      return { scriptSource: 'prefix failed to slot onto its children suffix' };
    },
    async detach() {
      calls.push('detach');
    },
  };
  return {
    calls,
    attachments,
    page: { context: () => ({ newCDPSession: async () => session }) },
    info: {
      async attach(_name, payload) {
        if (attachmentError) throw attachmentError;
        attachments.push(JSON.parse(payload.body.toString()));
      },
    },
    script(id) {
      listener({
        scriptId: id,
        url: `http://localhost:7822/_next/static/chunks/node_modules_${id}.js`,
      });
    },
  };
}

for (const phase of ['setupError', 'listenerError']) {
  test(`detaches attached CDP session when ${phase} rejects before cleanup is returned`, async () => {
    const error = new Error(phase);
    const f = fixture({ [phase]: error });
    await assert.rejects(
      captureStorefrontSlotDiagnostics(f.page, f.info),
      error
    );
    assert.equal(f.calls.filter((call) => call === 'detach').length, 1);
  });
}

test('unavailable first script does not prevent capture from later candidates', async () => {
  const f = fixture({ unavailable: ['first'] });
  const finish = await captureStorefrontSlotDiagnostics(f.page, f.info);
  f.script('first');
  f.script('second');
  await finish(true);
  assert.equal(f.attachments.length, 1);
  assert.equal(f.attachments[0].unavailableScriptCount, 1);
  assert.equal(f.attachments[0].sources.length, 1);
  assert.match(f.attachments[0].sources[0].chunk, /second/);
  assert.equal(f.calls.filter((call) => call === 'detach').length, 1);
});

test('all unavailable scripts still produce a bounded diagnostic attachment and detach', async () => {
  const f = fixture({ unavailable: ['first', 'second'] });
  const finish = await captureStorefrontSlotDiagnostics(f.page, f.info);
  f.script('first');
  f.script('second');
  await finish(true);
  assert.deepEqual(f.attachments[0].sources, []);
  assert.equal(f.attachments[0].unavailableScriptCount, 2);
  assert.equal(f.calls.filter((call) => call === 'detach').length, 1);
});

test('passing runtime does not collect sources and still detaches', async () => {
  const f = fixture();
  const finish = await captureStorefrontSlotDiagnostics(f.page, f.info);
  f.script('first');
  await finish(false);
  assert.equal(f.attachments.length, 0);
  assert.deepEqual(
    f.calls.map((call) => call.method ?? call),
    ['Debugger.enable', 'detach']
  );
});

test('attachment failure preserves cleanup', async () => {
  const error = new Error('attachment failed');
  const f = fixture({ attachmentError: error });
  const finish = await captureStorefrontSlotDiagnostics(f.page, f.info);
  await assert.rejects(finish(true), error);
  assert.equal(f.calls.filter((call) => call === 'detach').length, 1);
});
