import assert from 'node:assert/strict';
import { afterEach, test, vi } from 'vitest';

const context = vi.hoisted(() => ({ id: 'a'.repeat(32) }));
vi.mock('next/headers', () => ({
  headers: async () =>
    new Headers({
      'x-lettin-profile-request-id': context.id,
    }),
}));

import { traceLettinRead } from './read-diagnostics';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test('actual read emits bounded context identity and fixed stage without payload', async () => {
  vi.stubEnv('LETTIN_READ_DIAGNOSTICS', 'true');
  vi.stubEnv('TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS', '1');
  const output = vi.spyOn(console, 'info').mockImplementation(() => {});
  const value = { privatePayload: 'must not be logged' };
  assert.equal(
    await traceLettinRead('profile actor', async () => value),
    value
  );
  const events = output.mock.calls
    .filter(([marker]) => marker === '[lettin-profile-read]')
    .map(([, payload]) => JSON.parse(String(payload)));
  assert.deepEqual(
    events.map((item) => item.event),
    ['started', 'completed']
  );
  assert.ok(
    events.every(
      (item) => item.requestId === context.id && item.stage === 'profile actor'
    )
  );
  assert.doesNotMatch(
    JSON.stringify(output.mock.calls),
    /privatePayload|must not be logged/
  );
});

test('logging failure preserves original read rejection and success', async () => {
  vi.stubEnv('LETTIN_READ_DIAGNOSTICS', 'true');
  vi.stubEnv('TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS', '1');
  vi.spyOn(console, 'info').mockImplementation(() => {
    throw new Error('log');
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {
    throw new Error('log');
  });
  const original = new Error('original read');
  await assert.rejects(
    traceLettinRead('profile actor', async () => {
      throw original;
    }),
    (error) => error === original
  );
  assert.equal(await traceLettinRead('profile actor', async () => 42), 42);
});

test('malformed or absent context and disabled identity retain legacy read behavior', async () => {
  vi.stubEnv('LETTIN_READ_DIAGNOSTICS', 'true');
  vi.stubEnv('TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS', '1');
  const output = vi.spyOn(console, 'info').mockImplementation(() => {});
  for (const id of ['', 'invalid', 'a'.repeat(33)]) {
    context.id = id;
    assert.equal(await traceLettinRead('profile actor', async () => 7), 7);
  }
  context.id = 'a'.repeat(32);
  vi.stubEnv('TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS', '0');
  assert.equal(await traceLettinRead('profile actor', async () => 8), 8);
  assert.equal(
    output.mock.calls.some(([marker]) => marker === '[lettin-profile-read]'),
    false
  );
});

test('concurrent read scopes retain their own captured context IDs', async () => {
  vi.stubEnv('LETTIN_READ_DIAGNOSTICS', 'true');
  vi.stubEnv('TUTURUUU_LETTIN_PROFILE_DIAGNOSTICS', '1');
  const output = vi.spyOn(console, 'info').mockImplementation(() => {});
  let release = () => {};
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  context.id = 'a'.repeat(32);
  const first = traceLettinRead('profile actor', async () => {
    await barrier;
    return 1;
  });
  context.id = 'b'.repeat(32);
  const second = traceLettinRead('profile bindings', async () => 2);
  try {
    assert.equal(await second, 2);
  } finally {
    release();
  }
  assert.equal(await first, 1);
  const events = output.mock.calls
    .filter(([marker]) => marker === '[lettin-profile-read]')
    .map(([, payload]) => JSON.parse(String(payload)));
  assert.equal(events.length, 4);
  assert.ok(
    events
      .filter((event) => event.stage === 'profile actor')
      .every((event) => event.requestId === 'a'.repeat(32))
  );
  assert.ok(
    events
      .filter((event) => event.stage === 'profile bindings')
      .every((event) => event.requestId === 'b'.repeat(32))
  );
  context.id = 'a'.repeat(32);
});
