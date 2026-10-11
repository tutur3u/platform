import assert from 'node:assert/strict';
import test from 'node:test';
import { failureSummary } from './diagnostic.mjs';

test('captures a fixture error body', async () => {
  assert.equal(
    await failureSummary(new Response('fixture failure')),
    'fixture failure'
  );
});
test('caps streamed error bytes and cancels unfinished input', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('abcdefgh'));
      },
      cancel() {
        cancelled = true;
      },
    })
  );
  assert.equal(await failureSummary(response, { maxBytes: 4 }), 'abcd');
  assert.equal(cancelled, true);
});
test('settles a stalled error body and cancels it', async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      },
    })
  );
  assert.match(await failureSummary(response, { timeoutMs: 5 }), /deadline/);
  assert.equal(cancelled, true);
});
