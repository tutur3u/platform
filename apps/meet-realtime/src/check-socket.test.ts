import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForCheckSocket } from './check-socket.ts';

class Socket extends EventTarget {
  readyState = 0;
  closeCalls = 0;
  listeners = new Set<string>();
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null
  ) {
    this.listeners.add(type);
    super.addEventListener(type, callback);
  }
  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null
  ) {
    this.listeners.delete(type);
    super.removeEventListener(type, callback);
  }
  close() {
    this.closeCalls++;
    this.readyState = 3;
    this.dispatchEvent(new Event('close'));
  }
  open() {
    this.readyState = 1;
    this.dispatchEvent(new Event('open'));
  }
}

test('accepts an already-open socket without waiting for another open event', async () => {
  const socket = new Socket();
  socket.open();
  await waitForCheckSocket(socket, 20);
  assert.equal(socket.closeCalls, 0);
  assert.equal(socket.listeners.size, 0);
});

test('successful opening disposes listeners and cancels the deadline', async () => {
  const socket = new Socket();
  const connected = waitForCheckSocket(socket, 5);
  socket.open();
  await connected;
  await new Promise((resolve) => setTimeout(resolve, 15));
  socket.dispatchEvent(new Event('error'));
  assert.equal(socket.closeCalls, 0);
  assert.equal(socket.listeners.size, 0);
});

for (const state of [2, 3]) {
  test(`rejects an already-terminal socket in state ${state}`, async () => {
    const socket = new Socket();
    socket.readyState = state;
    await assert.rejects(waitForCheckSocket(socket), /closed before opening/);
    assert.equal(socket.listeners.size, 0);
  });
}

for (const event of ['error', 'close']) {
  test(`rejects early ${event} and disposes the unsuccessful socket`, async () => {
    const socket = new Socket();
    const connected = waitForCheckSocket(socket, 20);
    socket.dispatchEvent(new Event(event));
    await assert.rejects(
      connected,
      event === 'error' ? /Connection failed/ : /closed before opening/
    );
    socket.open();
    assert.equal(socket.closeCalls, 1);
    assert.equal(socket.listeners.size, 0);
  });
}

test('timeout rejects and closes once; late opening cannot revive the attempt', async () => {
  const socket = new Socket();
  await assert.rejects(waitForCheckSocket(socket, 5), /Connection timed out/);
  socket.open();
  assert.equal(socket.closeCalls, 1);
  assert.equal(socket.listeners.size, 0);
});

test('a throwing close preserves timeout failure and still settles', async () => {
  const socket = new Socket();
  socket.close = () => {
    throw new Error('disposal failed');
  };
  await assert.rejects(waitForCheckSocket(socket, 5), /Connection timed out/);
  assert.equal(socket.listeners.size, 0);
});

test('opening during subscription does not leave listeners or a deadline', async () => {
  const socket = new Socket();
  const subscribe = socket.addEventListener.bind(socket);
  socket.addEventListener = (type, callback) => {
    subscribe(type, callback);
    if (type === 'open') socket.open();
  };
  await waitForCheckSocket(socket, 5);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(socket.closeCalls, 0);
  assert.equal(socket.listeners.size, 0);
});
