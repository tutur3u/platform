import assert from 'node:assert/strict';
import test from 'node:test';
import { readT3Usage } from './t3-usage.mjs';

const NOW = new Date('2026-11-21T18:02:00.000Z');

class FakeSocket extends EventTarget {
  constructor() {
    super();
    this.sent = [];
    this.closed = false;
  }

  send(message) {
    const request = JSON.parse(message);
    this.sent.push(request);
    queueMicrotask(() => {
      const exit =
        request.id === 'quota'
          ? { _tag: 'Success', value: { providers: [] } }
          : { _tag: 'Failure', cause: [] };
      this.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({ _tag: 'Exit', requestId: request.id, exit }),
        })
      );
    });
  }

  close() {
    this.closed = true;
  }
}

test('verifies environment before auth and calls only the two read RPCs', async () => {
  const calls = [];
  const socket = new FakeSocket();
  const result = await readT3Usage({
    origin: 'https://t3.example.com',
    environmentId: 'fixture-environment',
    bearer: 'test-local-bearer',
    now: NOW,
    async fetchImpl(url, options) {
      calls.push({
        url: String(url),
        headers: options.headers,
        method: options.method,
      });
      return calls.length === 1
        ? Response.json({ environmentId: 'fixture-environment' })
        : Response.json({ ticket: 'test-ticket' });
    },
    openSocket(url) {
      assert.equal(url.origin, 'wss://t3.example.com');
      assert.equal(url.searchParams.get('orchestrationProtocol'), '2');
      assert.equal(url.searchParams.get('wsTicket'), 'test-ticket');
      queueMicrotask(() => socket.dispatchEvent(new Event('open')));
      return socket;
    },
  });
  assert.equal(calls[0].headers.authorization, undefined);
  assert.equal(calls[1].headers.authorization, 'Bearer test-local-bearer');
  assert.equal(
    calls[1].url,
    'https://t3.example.com/api/auth/websocket-ticket/rpc'
  );
  assert.equal(socket.closed, true);
  assert.deepEqual(
    socket.sent.map((request) => request.tag),
    ['server.getConfig', 'server.getUsageSummary']
  );
  assert.deepEqual(socket.sent[1].payload, {
    sinceDay: '2026-11-16',
    untilDay: '2026-11-22',
    timeZone: 'Asia/Ho_Chi_Minh',
    resolution: 'day',
    provisional: true,
  });
  assert.deepEqual(result, {
    quota: { kind: 'complete', observedAt: NOW.toISOString() },
    accounts: [],
    accounting: { kind: 'unavailable' },
    buckets: [],
  });
  assert.doesNotMatch(JSON.stringify(result), /test-local-bearer|test-ticket/);
});

test('sends no bearer when the configured environment identity differs', async () => {
  const calls = [];
  await assert.rejects(
    readT3Usage({
      origin: 'https://t3.example.com',
      environmentId: 'fixture-environment',
      bearer: 'test-local-bearer',
      async fetchImpl(url, options) {
        calls.push([url, options.headers]);
        return Response.json({ environmentId: 'different-environment' });
      },
      openSocket() {
        assert.fail('should not connect');
      },
    }),
    /usage_environment_mismatch/
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].authorization, undefined);
});
